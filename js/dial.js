function normalizedAngle(x, y, centerX, centerY) {
  return Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
}

function shortestAngleDelta(current, previous) {
  let delta = current - previous;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function createTuningDial(element, ring, onStep) {
  let pointerId = null;
  let lastAngle = 0;
  let accumulated = 0;
  let visualRotation = 0;
  const stepAngle = 34;

  function setRotation(rotation, immediate = false) {
    if (immediate) ring.style.transition = "none";
    ring.style.transform = `rotate(${rotation}deg)`;
    if (immediate) requestAnimationFrame(() => ring.style.removeProperty("transition"));
  }

  element.addEventListener("pointerdown", (event) => {
    const bounds = element.getBoundingClientRect();
    pointerId = event.pointerId;
    lastAngle = normalizedAngle(event.clientX, event.clientY, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    accumulated = 0;
    element.setPointerCapture(pointerId);
    element.classList.add("is-dragging");
  });

  element.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const bounds = element.getBoundingClientRect();
    const angle = normalizedAngle(event.clientX, event.clientY, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const delta = shortestAngleDelta(angle, lastAngle);
    lastAngle = angle;
    accumulated += delta;
    visualRotation += delta;
    setRotation(visualRotation, true);

    while (Math.abs(accumulated) >= stepAngle) {
      const direction = accumulated > 0 ? 1 : -1;
      onStep(direction);
      accumulated -= direction * stepAngle;
    }
  });

  function release(event) {
    if (event.pointerId !== pointerId) return;
    element.classList.remove("is-dragging");
    pointerId = null;
    visualRotation = Math.round(visualRotation / stepAngle) * stepAngle;
    setRotation(visualRotation);
  }

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);

  element.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1;
      visualRotation += direction * stepAngle;
      setRotation(visualRotation);
      onStep(direction);
    },
    { passive: false },
  );

  element.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    visualRotation += direction * stepAngle;
    setRotation(visualRotation);
    onStep(direction);
  });
}

export function createVolumeDial(element, initialValue, onChange) {
  let value = initialValue;
  let pointerId = null;
  let startY = 0;
  let startValue = value;

  function update(nextValue) {
    value = Math.min(100, Math.max(0, Math.round(nextValue)));
    const rotation = -135 + value * 2.7;
    element.style.transform = `rotate(${rotation}deg)`;
    element.setAttribute("aria-valuenow", String(value));
    onChange(value);
  }

  element.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    startY = event.clientY;
    startValue = value;
    element.setPointerCapture(pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    update(startValue + (startY - event.clientY));
  });

  const release = (event) => {
    if (event.pointerId === pointerId) pointerId = null;
  };
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);

  element.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      update(value + (event.deltaY < 0 ? 4 : -4));
    },
    { passive: false },
  );

  element.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") update(value + 5);
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") update(value - 5);
    else return;
    event.preventDefault();
  });

  update(initialValue);
}
