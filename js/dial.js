export function createChannelButtons(field, upButton, downButton, onStep) {
  let lockedUntil = 0;

  function changeChannel(direction) {
    if (Date.now() < lockedUntil) return;
    lockedUntil = Date.now() + 850;
    field.classList.add("is-locked");
    upButton.disabled = true;
    downButton.disabled = true;
    onStep(direction);
    setTimeout(() => {
      field.classList.remove("is-locked");
      upButton.disabled = false;
      downButton.disabled = false;
    }, 850);
  }

  upButton.addEventListener("click", () => changeChannel(1));
  downButton.addEventListener("click", () => changeChannel(-1));
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
