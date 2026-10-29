// 補足資料のサンプル写真（Codex gpt-6.1-sol で生成）
import lineA from '../assets/img/photo_line_a.webp'
import jig from '../assets/img/photo_jig.webp'
import cover from '../assets/img/photo_cover.webp'
import cart from '../assets/img/photo_cart.webp'

export const PHOTOS = {
  lineA: { name: '現場写真_Aライン.jpg', src: lineA, size: 1_820_000 },
  jig: { name: '現物写真_BK-2210.jpg', src: jig, size: 1_460_000 },
  cover: { name: '破損箇所.jpg', src: cover, size: 2_130_000 },
  cart: { name: '台車_現状.jpg', src: cart, size: 1_270_000 },
} as const
