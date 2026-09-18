import { test, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App.jsx";
test("empty studio explains photo workflow and never pretends an image is generated", () => {
  const html = renderToStaticMarkup(
    React.createElement(App, {
      initial: { photos: [], artworks: [], jobs: [], hasKey: false },
    }),
  );
  expect(html).toContain("사진 추가");
  expect(html).toContain("OpenAI 연결 · 선택");
  expect(html).toContain("로컬 생성에는 필요 없어요");
  expect(html).toContain("OpenAI");
  expect(html).toContain("disabled");
  expect(html).not.toContain("생성이 완료");
});
test("imported artwork remains explicitly marked as imported", () => {
  const html = renderToStaticMarkup(
    React.createElement(App, {
      initial: {
        photos: [],
        artworks: [
          {
            id: "sample",
            name: "이전 시안",
            source: "imported",
            thumbnail: "data:image/png;base64,AA==",
          },
        ],
        jobs: [],
        hasKey: false,
      },
    }),
  );
  expect(html).toContain("가져온 그림");
  expect(html).toContain("이전 시안");
});
