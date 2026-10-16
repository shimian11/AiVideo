/**
 * @file Agnes 客户端纯逻辑测试
 * @description
 * 只测不依赖网络的纯函数（clampVideoSeconds）。
 * 真实 API 调用需要 Key 且会产生请求，不在单测范围内。
 */

import { describe, expect, it } from "vitest";
import {
  clampVideoSeconds,
  VIDEO_SECONDS_MAX,
  VIDEO_SECONDS_MIN,
  VIDEO_SECONDS_DEFAULT,
  MODELS,
} from "./agnes";

describe("MODELS", () => {
  it("三个模型都使用免费档", () => {
    // 2026-10-17 全部切到免费档；video 旧模型已于 2026-09-25 退役
    expect(MODELS.chat).toBe("agnes-3.0-flash");
    expect(MODELS.image).toBe("agnes-image-2.5-flash");
    expect(MODELS.video).toBe("agnes-video-2.5-flash");
  });

  it("不包含已退役的模型", () => {
    const all = Object.values(MODELS);
    expect(all).not.toContain("agnes-video-v2.0");
    expect(all).not.toContain("agnes-image-2.1-flash");
    expect(all).not.toContain("agnes-2.0-flash");
  });
});

describe("clampVideoSeconds", () => {
  it("合法区间的值原样返回（转为字符串）", () => {
    expect(clampVideoSeconds(5)).toBe("5");
    expect(clampVideoSeconds(4)).toBe("4");
    expect(clampVideoSeconds(12)).toBe("12");
  });

  it("低于下限时夹到 4 秒（覆盖分镜表里的历史 3 秒数据）", () => {
    expect(clampVideoSeconds(3)).toBe("4");
    expect(clampVideoSeconds(1)).toBe("4");
    expect(clampVideoSeconds(0)).toBe("4");
    expect(clampVideoSeconds(-5)).toBe("4");
  });

  it("高于上限时夹到 12 秒", () => {
    expect(clampVideoSeconds(13)).toBe("12");
    expect(clampVideoSeconds(60)).toBe("12");
    expect(clampVideoSeconds(9999)).toBe("12");
  });

  it("小数四舍五入到整数秒", () => {
    expect(clampVideoSeconds(5.4)).toBe("5");
    expect(clampVideoSeconds(5.6)).toBe("6");
    expect(clampVideoSeconds(4.2)).toBe("4");
  });

  it("非有限值退化为默认时长", () => {
    expect(clampVideoSeconds(NaN)).toBe(VIDEO_SECONDS_DEFAULT);
    expect(clampVideoSeconds(Infinity)).toBe(String(VIDEO_SECONDS_MAX));
    expect(clampVideoSeconds(-Infinity)).toBe(String(VIDEO_SECONDS_MIN));
  });

  it("返回值始终落在 API 合法区间内", () => {
    const samples = [-100, -1, 0, 1, 3, 4, 5, 7, 11, 12, 13, 100, 1e6];
    for (const s of samples) {
      const n = Number(clampVideoSeconds(s));
      expect(n).toBeGreaterThanOrEqual(VIDEO_SECONDS_MIN);
      expect(n).toBeLessThanOrEqual(VIDEO_SECONDS_MAX);
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});
