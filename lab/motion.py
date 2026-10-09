"""Optional camera and element keyframe animations for the lab explanatory videos.

Scene format (times are seconds from the start of a chapter):
  "motion": {
    "camera": [{"t": 0, "zoom": 1}, {"t": 3, "zoom": 1.12, "x": 90}],
    "elements": [{"target": "machine:hokuto", "keyframes": [
        {"t": 4, "dx": 120, "opacity": 0.8, "scale": 0.95},
        {"t": 5, "dx": 0, "opacity": 1, "scale": 1}
    ]}]
  }

Camera affects the documentary/background layer only. Hosts, analysis panel,
and subtitles remain fixed, readable overlays. No motion settings means the
existing renderer's output remains unchanged.
"""
from __future__ import annotations

import math
from PIL import Image


def _clamp(value, lower, upper):
    return max(lower, min(upper, value))


def _easing(p, kind):
    p = _clamp(p, 0.0, 1.0)
    if kind == "linear":
        return p
    if kind == "out":
        return 1.0 - (1.0 - p) ** 3
    # Smooth: zero velocity at either end.
    return p * p * (3.0 - 2.0 * p)


def sample(keyframes, t, defaults):
    """Interpolate numeric values. Omitted values inherit the previous keyframe.

    Sorting is stable for equal timestamps. The last keyframe at a timestamp
    wins, which permits instantaneous switches as well as smooth transitions.
    """
    if not keyframes:
        return dict(defaults)
    frames = []
    state = dict(defaults)
    for frame in sorted(keyframes, key=lambda f: float(f["t"])):
        state = {**state, **{k: float(v) for k, v in frame.items() if k in defaults}}
        frames.append((float(frame["t"]), dict(state), frame.get("ease", "smooth")))
    if t <= frames[0][0]:
        return dict(frames[0][1])
    for i in range(1, len(frames)):
        t1, right, ease = frames[i]
        t0, left, _ = frames[i - 1]
        if t <= t1:
            p = _easing((t - t0) / (t1 - t0), ease) if t1 > t0 else 1.0
            return {key: left[key] + (right[key] - left[key]) * p for key in defaults}
    return dict(frames[-1][1])


CAMERA_DEFAULT = {"x": 0.0, "y": 0.0, "zoom": 1.0}
ELEMENT_DEFAULT = {"dx": 0.0, "dy": 0.0, "scale": 1.0, "rotate": 0.0, "opacity": 1.0}


def camera_state(scene, t):
    return sample(scene.get("motion", {}).get("camera", []), t, CAMERA_DEFAULT)


def camera_image(image, state):
    """Crop a virtual camera view and expand to the canvas size.

    A zoom value >= 1 avoids exposing transparent/black borders. x/y move
    the source focal point in pixels, not the final output frame.
    """
    zoom = _clamp(float(state.get("zoom", 1.0)), 1.0, 3.0)
    if math.isclose(zoom, 1.0, abs_tol=1e-5):
        return image
    w, h = image.size
    crop_w, crop_h = w / zoom, h / zoom
    cx = _clamp(w / 2.0 + float(state.get("x", 0.0)), crop_w / 2, w - crop_w / 2)
    cy = _clamp(h / 2.0 + float(state.get("y", 0.0)), crop_h / 2, h - crop_h / 2)
    box = (int(round(cx - crop_w / 2)), int(round(cy - crop_h / 2)),
           int(round(cx + crop_w / 2)), int(round(cy + crop_h / 2)))
    return image.crop(box).resize((w, h), Image.Resampling.BICUBIC)


def matching_element(scene, cue):
    for element in scene.get("motion", {}).get("elements", []):
        if element.get("target") in (cue.get("id"), cue.get("type")):
            return element
    return None


def composite_element(canvas, layer, keyframes, t):
    """Composite an animated transparent cue as a separate transformable layer."""
    state = sample(keyframes, t, ELEMENT_DEFAULT)
    if state["opacity"] <= 0:
        return
    bounds = layer.getbbox()
    if not bounds:
        return
    img = layer.crop(bounds)
    scale = _clamp(state["scale"], 0.05, 4.0)
    if not math.isclose(scale, 1.0):
        img = img.resize((max(1, round(img.width * scale)),
                          max(1, round(img.height * scale))), Image.Resampling.BICUBIC)
    if not math.isclose(state["rotate"], 0.0):
        img = img.rotate(state["rotate"], resample=Image.Resampling.BICUBIC, expand=True)
    opacity = _clamp(state["opacity"], 0.0, 1.0)
    if opacity < 1:
        img.putalpha(img.getchannel("A").point(lambda a: round(a * opacity)))
    cx = (bounds[0] + bounds[2]) / 2.0 + state["dx"]
    cy = (bounds[1] + bounds[3]) / 2.0 + state["dy"]
    x, y = round(cx - img.width / 2), round(cy - img.height / 2)
    w, h = canvas.size
    left, top = max(0, x), max(0, y)
    right, bottom = min(w, x + img.width), min(h, y + img.height)
    if right <= left or bottom <= top:
        return
    cropped = img.crop((left - x, top - y, right - x, bottom - y))
    canvas.alpha_composite(cropped, (left, top))
