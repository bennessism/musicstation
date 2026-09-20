export function createChannelSlider(element, thumb, onStep, onActivate) {
  let pointerId = null;
  let startY = 0;
  let offset = 0;
  let lockedUntil = 0;
  const threshold = 20;
  const travel = 25;

  function setThumb(value) {
    thumb.style.transform = `translateY(calc(-50% + ${value}px))`;
  }

  function changeChannel(direction) {
    if (Date.now() < lockedUntil) return;
    lockedUntil = Date.now() + 850;
    element.classList.add("is-locked");
    onStep(direction);
    setTimeout(() => element.classList.remove("is-locked"), 850);
  }

  element.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    startY = event.clientY;
    offset = 0;
    element.setPointerCapture(pointerId);
    element.classList.add("is-dragging");
  });

  element.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    offset = Math.max(-travel, Math.min(travel, event.clientY - startY));
    setThumb(offset);
  });

  function release(event) {
    if (event.pointerId !== pointerId) return;
    element.classList.remove("is-dragging");
    pointerId = null;
    if (Math.abs(offset) >= threshold) changeChannel(offset < 0 ? 1 : -1);
    else onActivate?.();
    offset = 0;
    setThumb(0);
  }

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);

  element.addEventListener("keydown", (event) => {
    if (event.repeat || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    changeChannel(event.key === "ArrowUp" ? 1 : -1);
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
