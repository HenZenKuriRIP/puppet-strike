#!/usr/bin/env python3
"""
gen-music.py — synthesize original loopable BGM for Puppet Strike (cute×combat candy aesthetic).

Requires: python3, numpy, ffmpeg on PATH.

Regenerate:
  python3 tools/gen-music.py
  # writes WAV under tools/music/ and OGG Vorbis (~80 kbps) under public/audio/

All audio is procedurally synthesized — no copyrighted samples.
"""
from __future__ import annotations
import math, os, subprocess, struct, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WAV_DIR = ROOT / "tools" / "music"
OGG_DIR = ROOT / "public" / "audio"
SR = 22050  # mobile-friendly sample rate
RNG = np.random.default_rng(42)

# ── helpers ──────────────────────────────────────────────────────────────────
def midi(n: float) -> float:
    return 440.0 * (2.0 ** ((n - 69) / 12.0))

def env_adsr(n: int, a: float, d: float, s: float, r: float, sr: int = SR) -> np.ndarray:
    ea, ed, er = int(a * sr), int(d * sr), int(r * sr)
    es = max(0, n - ea - ed - er)
    parts = []
    if ea: parts.append(np.linspace(0, 1, ea, endpoint=False))
    if ed: parts.append(np.linspace(1, s, ed, endpoint=False))
    if es: parts.append(np.full(es, s))
    if er: parts.append(np.linspace(s if es or ed or ea else 0, 0, er, endpoint=False))
    e = np.concatenate(parts) if parts else np.zeros(0)
    if len(e) < n: e = np.pad(e, (0, n - len(e)))
    return e[:n].astype(np.float32)

def soft_limit(x: np.ndarray, drive: float = 1.15) -> np.ndarray:
    return np.tanh(x * drive).astype(np.float32)

def normalize(x: np.ndarray, peak: float = 0.92) -> np.ndarray:
    m = float(np.max(np.abs(x)) + 1e-9)
    return (x * (peak / m)).astype(np.float32)

def noise(n: int) -> np.ndarray:
    return RNG.uniform(-1, 1, n).astype(np.float32)

def lowpass(x: np.ndarray, cutoff: float, sr: int = SR) -> np.ndarray:
    # one-pole
    a = math.exp(-2 * math.pi * cutoff / sr)
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        s = (1 - a) * v + a * s
        y[i] = s
    return y

def highpass(x: np.ndarray, cutoff: float, sr: int = SR) -> np.ndarray:
    return x - lowpass(x, cutoff, sr)

def bandpass(x: np.ndarray, lo: float, hi: float, sr: int = SR) -> np.ndarray:
    return highpass(lowpass(x, hi, sr), lo, sr)

# ── drum voices ──────────────────────────────────────────────────────────────
def kick(dur: float = 0.28, f0: float = 150, f1: float = 42, gain: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = f0 * (f1 / f0) ** np.clip(t / dur, 0, 1)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    click = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 80) * 0.35
    e = np.exp(-t * 9)
    return ((body * e + click) * gain).astype(np.float32)

def snare(dur: float = 0.18, gain: float = 0.85) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22)
    nz = bandpass(noise(n), 800, 7000)
    nz *= np.exp(-t * 18)
    return ((tone * 0.45 + nz * 0.9) * gain).astype(np.float32)

def clap(dur: float = 0.16, gain: float = 0.7) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    # multi-burst clap
    bursts = np.zeros(n, dtype=np.float32)
    for off, g in ((0.0, 1.0), (0.012, 0.7), (0.024, 0.45), (0.038, 0.3)):
        o = int(off * SR)
        m = n - o
        if m <= 0: continue
        b = bandpass(noise(m), 1000, 6000) * np.exp(-np.arange(m) / SR * 35) * g
        bursts[o:o + m] += b
    return (bursts * gain).astype(np.float32)

def hihat(dur: float = 0.06, open_: bool = False, gain: float = 0.35) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    decay = 12 if open_ else 55
    nz = highpass(noise(n), 6000) * np.exp(-t * decay)
    return (nz * gain).astype(np.float32)

def tom(dur: float = 0.22, f0: float = 220, gain: float = 0.6) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = f0 * np.exp(-t * 4)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 10)
    return (body * gain).astype(np.float32)

def woodblock(dur: float = 0.08, f: float = 880, gain: float = 0.4) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 60) * gain).astype(np.float32)

def brick(dur: float = 0.1, gain: float = 0.5) -> np.ndarray:
    """Toy-brick / plastic click for Block City."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = bandpass(noise(n), 1500, 5000) * np.exp(-t * 45)
    tone = np.sin(2 * np.pi * 640 * t) * np.exp(-t * 40) * 0.4
    return ((nz + tone) * gain).astype(np.float32)

# ── melodic voices ───────────────────────────────────────────────────────────
def bass_note(freq: float, dur: float, gain: float = 0.45, kind: str = "sine") -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "square":
        wave_ = np.sign(np.sin(2 * np.pi * freq * t)) * 0.55 + np.sin(2 * np.pi * freq * t) * 0.45
    elif kind == "triangle":
        wave_ = 2 * np.abs(2 * ((t * freq) % 1) - 1) - 1
    else:
        wave_ = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    e = env_adsr(n, 0.01, 0.08, 0.7, min(0.12, dur * 0.35))
    return (wave_ * e * gain).astype(np.float32)

def pluck(freq: float, dur: float, gain: float = 0.28, bright: float = 0.5) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    # Karplus-ish: harmonic stack with fast decay
    wave_ = (np.sin(2 * np.pi * freq * t)
             + bright * 0.4 * np.sin(2 * np.pi * freq * 2 * t)
             + bright * 0.2 * np.sin(2 * np.pi * freq * 3 * t)
             + bright * 0.1 * np.sin(2 * np.pi * freq * 5 * t))
    e = np.exp(-t * (6 + (1 - bright) * 4))
    attack = np.minimum(1.0, t * 200)
    return (wave_ * e * attack * gain).astype(np.float32)

def square_lead(freq: float, dur: float, gain: float = 0.22) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    # soft square via tanh
    wave_ = np.tanh(3.5 * np.sin(2 * np.pi * freq * t))
    e = env_adsr(n, 0.005, 0.05, 0.55, min(0.1, dur * 0.3))
    return (wave_ * e * gain).astype(np.float32)

def pad_chord(freqs: list[float], dur: float, gain: float = 0.12) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    wave_ = np.zeros(n, dtype=np.float32)
    for f in freqs:
        wave_ += np.sin(2 * np.pi * f * t).astype(np.float32)
        wave_ += 0.25 * np.sin(2 * np.pi * f * 2 * t).astype(np.float32)
    wave_ /= max(1, len(freqs))
    e = env_adsr(n, 0.08, 0.15, 0.7, 0.2)
    return (wave_ * e * gain).astype(np.float32)

def arp_tone(freq: float, dur: float, gain: float = 0.2) -> np.ndarray:
    return pluck(freq, dur, gain=gain, bright=0.7)

# ── sequencing ───────────────────────────────────────────────────────────────
def place(buf: np.ndarray, sample: np.ndarray, at: float, duck: float = 1.0):
    i = int(at * SR)
    n = len(sample)
    if i >= len(buf): return
    end = min(len(buf), i + n)
    buf[i:end] += sample[: end - i] * duck

def sidechain_duck(buf: np.ndarray, kicks_at: list[float], duck_amt: float = 0.45, release: float = 0.18):
    """Multiply buffer by ducking envelope triggered at kick times (sidechain feel)."""
    env = np.ones(len(buf), dtype=np.float32)
    for t0 in kicks_at:
        i0 = int(t0 * SR)
        n = int(release * SR)
        if i0 >= len(buf): continue
        end = min(len(buf), i0 + n)
        # quick dip then recover
        ramp = np.linspace(1 - duck_amt, 1.0, end - i0)
        env[i0:end] = np.minimum(env[i0:end], ramp.astype(np.float32))
    return buf * env

def beat_times(bpm: float, bars: int, beats_per_bar: int = 4) -> float:
    return bars * beats_per_bar * 60.0 / bpm

def steps(bpm: float, n_steps: int, subdiv: int = 4) -> np.ndarray:
    """Return times for n_steps sixteenth-notes (or subdiv)."""
    step = 60.0 / bpm / (subdiv / 4)  # for subdiv=4 → 16th
    return np.arange(n_steps) * step

# ── track builders ───────────────────────────────────────────────────────────
# Scale helpers — candy major-ish
C4, D4, E4, F4, G4, A4, B4 = 60, 62, 64, 65, 67, 69, 71
C5, D5, E5, F5, G5, A5, B5 = 72, 74, 76, 77, 79, 81, 83
C3, D3, E3, F3, G3, A3, B3, Bb3 = 48, 50, 52, 53, 55, 57, 59, 58
C2, D2, Eb2, F2, G2, A2, Bb2 = 36, 38, 39, 41, 43, 45, 46
Ab4, Bb4 = 68, 70
C6, E6 = 84, 88

def make_menu(bpm: float = 115.0, bars: int = 16) -> np.ndarray:
    """Bouncy playful candy groove — warm pastel feel."""
    dur = beat_times(bpm, bars)
    n = int(dur * SR)
    drums = np.zeros(n, dtype=np.float32)
    bass = np.zeros(n, dtype=np.float32)
    lead = np.zeros(n, dtype=np.float32)
    pads = np.zeros(n, dtype=np.float32)
    kicks_at: list[float] = []

    beat = 60.0 / bpm
    # Chord progression (2 bars each): C – Am – F – G  × 2, then C – Em – F – G
    prog = [
        ([C4, E4, G4], C2), ([A3, C4, E4], A2), ([F3, A3, C4], F2), ([G3, B3, D4], G2),
        ([C4, E4, G4], C2), ([A3, C4, E4], A2), ([F3, A3, C4], F2), ([G3, B3, D4], G2),
        ([C4, E4, G4], C2), ([E3, G3, B3], E3 - 12), ([F3, A3, C4], F2), ([G3, B3, D4], G2),
        ([C4, E4, G4], C2), ([A3, C4, E4], A2), ([F3, A3, C4], F2), ([G3, B3, D4], G2),
    ]
    # Melodic motif (candy bounce)
    motif = [E5, G5, E5, C5, D5, E5, G5, A5, G5, E5, D5, C5, B4, C5, D5, E5]
    motif2 = [G5, A5, G5, E5, F5, G5, A5, C6, A5, G5, E5, D5, E5, G5, A5, G5]

    for bar in range(bars):
        t_bar = bar * 4 * beat
        ch, root = prog[bar % len(prog)]
        # pad every 2 bars
        if bar % 2 == 0:
            place(pads, pad_chord([midi(x) for x in ch], beat * 8, gain=0.1), t_bar)

        # drums: kick on 1 & 3, snare/clap on 2 & 4, hat 8ths
        for b in range(4):
            t = t_bar + b * beat
            if b % 2 == 0:
                place(drums, kick(0.26, 140, 45, 0.95), t)
                kicks_at.append(t)
            else:
                place(drums, clap(0.14, 0.55 if b == 1 else 0.65), t)
                if bar % 2 == 1 and b == 3:
                    place(drums, snare(0.16, 0.5), t + 0.02)
            place(drums, hihat(0.05, False, 0.28), t)
            place(drums, hihat(0.04, False, 0.18), t + beat * 0.5)
            # occasional open hat
            if b == 3 and bar % 4 == 3:
                place(drums, hihat(0.18, True, 0.22), t + beat * 0.5)

        # bass: root + fifth bounce
        place(bass, bass_note(midi(root), beat * 0.9, 0.42, "sine"), t_bar)
        place(bass, bass_note(midi(root + 7), beat * 0.45, 0.32, "sine"), t_bar + beat)
        place(bass, bass_note(midi(root), beat * 0.9, 0.4, "sine"), t_bar + beat * 2)
        place(bass, bass_note(midi(root + 12), beat * 0.4, 0.28, "triangle"), t_bar + beat * 3)

        # plucky lead arps
        m = motif if (bar // 4) % 2 == 0 else motif2
        for i in range(8):
            note = m[(bar * 2 + i) % len(m)]
            place(lead, pluck(midi(note), beat * 0.45, 0.22 if i % 2 == 0 else 0.16, 0.65),
                  t_bar + i * beat * 0.5)

    mix = drums + sidechain_duck(bass + lead + pads, kicks_at, 0.4, 0.16)
    # gentle loop crossfade
    xf = int(0.04 * SR)
    if xf > 0:
        fade = np.linspace(0, 1, xf)
        mix[:xf] = mix[:xf] * fade + mix[-xf:] * (1 - fade)
        mix[-xf:] = mix[:xf]  # match ends
    return soft_limit(normalize(mix))

def make_combat(bpm: float = 134.0, bars: int = 16, industrial: bool = False) -> np.ndarray:
    """Punchy energetic battle beat — strong kick/snare/clap + playful lead.
    industrial=True → Block City toy-brick percussion variant."""
    dur = beat_times(bpm, bars)
    n = int(dur * SR)
    drums = np.zeros(n, dtype=np.float32)
    bass = np.zeros(n, dtype=np.float32)
    lead = np.zeros(n, dtype=np.float32)
    fx = np.zeros(n, dtype=np.float32)
    kicks_at: list[float] = []
    beat = 60.0 / bpm

    # Minor candy combat: Am – F – C – G feel but punchier roots
    roots = [A2, F2, C2, G2] * (bars // 4 + 1)
    # Aggressive lead riff
    riff = [A4, C5, E5, A5, G5, E5, C5, A4, F4, A4, C5, F5, E5, D5, C5, B4]
    riff_b = [A4, E5, A5, C6, B5, A5, E5, C5, G4, B4, D5, G5, F5, E5, D5, C5]

    for bar in range(bars):
        t_bar = bar * 4 * beat
        root = roots[bar]
        # four-on-floor + backbeat
        for b in range(4):
            t = t_bar + b * beat
            place(drums, kick(0.24, 155 if not industrial else 130, 40, 1.0), t)
            kicks_at.append(t)
            if industrial:
                place(drums, brick(0.08, 0.45), t + beat * 0.25)
                place(drums, woodblock(0.06, 720 + (b % 2) * 200, 0.3), t + beat * 0.5)
                if b in (1, 3):
                    place(drums, clap(0.12, 0.7), t)
                    place(drums, snare(0.14, 0.55), t)
                    place(drums, brick(0.09, 0.5), t + 0.01)
            else:
                if b in (1, 3):
                    place(drums, snare(0.15, 0.75), t)
                    place(drums, clap(0.12, 0.45), t + 0.005)
                place(drums, hihat(0.04, False, 0.32), t)
                place(drums, hihat(0.035, False, 0.22), t + beat * 0.25)
                place(drums, hihat(0.04, False, 0.28), t + beat * 0.5)
                place(drums, hihat(0.03, False, 0.18), t + beat * 0.75)
            if b == 3 and bar % 4 == 3:
                place(drums, tom(0.18, 180, 0.5), t + beat * 0.5)
                place(drums, tom(0.16, 240, 0.4), t + beat * 0.75)

        # bass: driving offbeat
        for i, off in enumerate((0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5)):
            f = midi(root if i % 2 == 0 else root + 7)
            kind = "square" if industrial else "sine"
            place(bass, bass_note(f, beat * 0.42, 0.48 if i % 2 == 0 else 0.32, kind), t_bar + off * beat)

        # lead
        r = riff if (bar // 4) % 2 == 0 else riff_b
        for i in range(8):
            note = r[(bar * 2 + i) % len(r)]
            t = t_bar + i * beat * 0.5
            if industrial:
                place(lead, square_lead(midi(note), beat * 0.4, 0.2), t)
            else:
                place(lead, pluck(midi(note), beat * 0.4, 0.26, 0.8), t)
                if i % 4 == 0:
                    place(lead, arp_tone(midi(note + 12), beat * 0.3, 0.12), t + 0.02)

        # fill every 8 bars
        if bar % 8 == 7:
            for k, f in enumerate((200, 260, 320, 400)):
                place(fx, tom(0.12, f, 0.45), t_bar + 3 * beat + k * beat * 0.25)

    body = sidechain_duck(bass + lead + fx, kicks_at, 0.5, 0.14)
    mix = drums * (1.05 if industrial else 1.0) + body
    xf = int(0.03 * SR)
    if xf > 0:
        fade = np.linspace(0, 1, xf)
        mix[:xf] = mix[:xf] * fade + mix[-xf:] * (1 - fade)
        mix[-xf:] = mix[:xf]
    return soft_limit(normalize(mix))

def make_boss(bpm: float = 108.0, bars: int = 20) -> np.ndarray:
    """Darker heavier dramatic drop — bigger drums, tense melody."""
    dur = beat_times(bpm, bars)
    n = int(dur * SR)
    drums = np.zeros(n, dtype=np.float32)
    bass = np.zeros(n, dtype=np.float32)
    lead = np.zeros(n, dtype=np.float32)
    pads = np.zeros(n, dtype=np.float32)
    kicks_at: list[float] = []
    beat = 60.0 / bpm

    # Darker: Dm – Bb – F – C / Dm – Bb – Gm – A
    roots = [D2, Bb2 - 12, F2, C2, D2, Bb2 - 12, G2 - 5, A2 - 12]
    tense = [D4, F4, A4, D5, C5, A4, F4, E4, D4, F4, Ab4, A4, G4, F4, E4, D4]
    drop_riff = [D5, D5, A4, D5, F5, E5, D5, A4, Bb4, A4, G4, F4, E4, F4, G4, A4]

    for bar in range(bars):
        t_bar = bar * 4 * beat
        root = roots[bar % len(roots)]
        half = bar // (bars // 2)  # 0 = build, 1 = drop

        # pads
        if bar % 2 == 0:
            ch_midi = [midi(root + 12), midi(root + 15), midi(root + 19)]
            place(pads, pad_chord(ch_midi, beat * 8, 0.14 if half else 0.09), t_bar)

        for b in range(4):
            t = t_bar + b * beat
            # bigger kick
            place(drums, kick(0.32, 120, 35, 1.15), t)
            kicks_at.append(t)
            if half:
                # double kick feel on drops
                if b in (0, 2):
                    place(drums, kick(0.18, 100, 40, 0.7), t + beat * 0.5)
                    kicks_at.append(t + beat * 0.5)
            if b in (1, 3):
                place(drums, snare(0.2, 0.9), t)
                place(drums, clap(0.15, 0.55), t)
            place(drums, hihat(0.05, False, 0.25 if half else 0.15), t)
            if half:
                place(drums, hihat(0.04, False, 0.2), t + beat * 0.5)
            if b == 3 and bar % 4 == 3:
                place(drums, tom(0.2, 140, 0.6), t + beat * 0.33)
                place(drums, tom(0.18, 200, 0.5), t + beat * 0.66)

        # bass — heavy low
        for i, off in enumerate((0, 1.0, 2.0, 3.0) if not half else (0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5)):
            f = midi(root if i % 2 == 0 else root + 12)
            place(bass, bass_note(f, beat * (0.85 if not half else 0.4), 0.55, "square" if half else "sine"),
                  t_bar + off * beat)

        # melody
        r = drop_riff if half else tense
        for i in range(8 if half else 4):
            note = r[(bar * 2 + i) % len(r)]
            step = 0.5 if half else 1.0
            t = t_bar + i * beat * step
            place(lead, square_lead(midi(note), beat * step * 0.85, 0.24 if half else 0.16), t)
            if half and i % 2 == 0:
                place(lead, pluck(midi(note + 7), beat * 0.35, 0.14, 0.5), t + 0.03)

    body = sidechain_duck(bass + lead + pads, kicks_at, 0.55, 0.2)
    mix = drums * 1.1 + body
    xf = int(0.05 * SR)
    if xf > 0:
        fade = np.linspace(0, 1, xf)
        mix[:xf] = mix[:xf] * fade + mix[-xf:] * (1 - fade)
        mix[-xf:] = mix[:xf]
    return soft_limit(normalize(mix))

def make_stinger(kind: str = "win") -> np.ndarray:
    """Short non-looping win/lose sting (~2.5s)."""
    n = int(2.6 * SR)
    buf = np.zeros(n, dtype=np.float32)
    if kind == "win":
        notes = [C5, E5, G5, C6, E6, G5, C6]
        for i, note in enumerate(notes):
            place(buf, pluck(midi(note), 0.45, 0.35, 0.8), 0.08 + i * 0.22)
            place(buf, pad_chord([midi(note), midi(note + 4), midi(note + 7)], 0.6, 0.1), 0.08 + i * 0.22)
        place(buf, kick(0.3, 140, 50, 0.6), 0.05)
        place(buf, clap(0.2, 0.5), 1.4)
    else:
        notes = [G4, E4, C4, A3, G3, E3]
        for i, note in enumerate(notes):
            place(buf, square_lead(midi(note), 0.4, 0.22), 0.1 + i * 0.32)
        place(buf, kick(0.4, 90, 30, 0.7), 0.05)
        place(buf, snare(0.3, 0.4), 1.8)
    return soft_limit(normalize(buf, 0.88))

# ── I/O ──────────────────────────────────────────────────────────────────────
def write_wav(path: Path, audio: np.ndarray, sr: int = SR):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(audio * 32767, -32768, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())

def wav_to_ogg(wav: Path, ogg: Path, bitrate: str = "80k"):
    ogg.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-i", str(wav),
        "-c:a", "libvorbis", "-b:a", bitrate,
        "-ar", str(SR), "-ac", "1",
        str(ogg),
    ]
    subprocess.run(cmd, check=True, capture_output=True)

def main():
    tracks = {
        "menu": ("menu.wav", "menu.ogg", lambda: make_menu(115, 16), "80k"),
        "combat": ("combat.wav", "combat.ogg", lambda: make_combat(134, 16, False), "80k"),
        "combat_block": ("combat_block.wav", "combat_block.ogg", lambda: make_combat(132, 16, True), "80k"),
        "boss": ("boss.wav", "boss.ogg", lambda: make_boss(108, 20), "72k"),
        "win": ("win.wav", "win.ogg", lambda: make_stinger("win"), "64k"),
        "lose": ("lose.wav", "lose.ogg", lambda: make_stinger("lose"), "64k"),
    }
    print(f"Synthesizing BGM → {WAV_DIR} / {OGG_DIR} (sr={SR})")
    for name, (wav_name, ogg_name, factory, br) in tracks.items():
        print(f"  · {name} …", flush=True)
        audio = factory()
        wav_path = WAV_DIR / wav_name
        ogg_path = OGG_DIR / ogg_name
        write_wav(wav_path, audio)
        wav_to_ogg(wav_path, ogg_path, br)
        dur = len(audio) / SR
        sz = ogg_path.stat().st_size
        print(f"    {dur:.1f}s  ogg={sz // 1024}KB  wav={wav_path.stat().st_size // 1024}KB")
    total = sum((OGG_DIR / t[1]).stat().st_size for t in tracks.values())
    print(f"Done. Total OGG ≈ {total / 1024:.0f} KB")

if __name__ == "__main__":
    main()
