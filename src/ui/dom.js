// Az app ~100 elemet keres ki azonosító alapján. A natív querySelector
// hiányzó elemre `null`-t ad, amitől a hiba csak jóval később, egy
// "cannot read properties of null" formájában jön elő — vagy sehol, ha
// csak egy eseményfigyelő maradt el. Ezek a segédek azonnal, beszédesen
// elhasalnak.

export function el(selector, root = document) {
  const found = root.querySelector(selector)
  if (!found) {
    throw new Error(`Hiányzó DOM-elem: ${selector}`)
  }
  return found
}

export function maybeEl(selector, root = document) {
  return root.querySelector(selector)
}

export function els(selector, root = document) {
  return [...root.querySelectorAll(selector)]
}

// Rövid segéd elemkészítéshez, hogy a panelek ne string-összefűzéssel
// (innerHTML) épüljenek.
export function create(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue
    if (key === 'class') node.className = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key in node) node[key] = value
    else node.setAttribute(key, value)
  }
  for (const child of [children].flat()) {
    if (child === undefined || child === null || child === false) continue
    node.append(child)
  }
  return node
}
