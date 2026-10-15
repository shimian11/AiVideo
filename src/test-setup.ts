/**
 * @file 测试环境准备
 * @description
 * 补齐 jsdom 缺失的浏览器 API，让画布组件可以在 Node 下被渲染与交互。
 *
 * 需要处理的三类缺口：
 * 1. `ResizeObserver` —— jsdom 未实现，画布用它观测容器尺寸
 * 2. `setPointerCapture` / `releasePointerCapture` —— jsdom 未实现，
 *    而画布在拖拽与拉线时会调用它们把后续指针事件固定到容器上
 * 3. `scrollTo` —— 部分组件库在卸载时会调用
 */

/** 最小可用的 ResizeObserver：记录被观测元素但不触发回调 */
class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

// jsdom 的 Element 没有指针捕获 API，补空实现。
// 真实浏览器中这些方法一定存在，补空不会改变生产行为。
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

if (typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollTo(): void {};
}
