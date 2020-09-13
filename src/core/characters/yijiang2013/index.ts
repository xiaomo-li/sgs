import { Character } from '../character';
import { CaoChong } from './caochong';

export const YiJiang2013Package: (index: number) => Character[] = index => [
  new CaoChong(index++),
  // new FuHuangHou(index++),
  // new GuanPing(index++),
  // new GuoHuai(index++),
  // new JianYong(index++),
  // new LiRu(index++),
  // new LiuFeng(index++),
  // new ManChong(index++),
  // new PanZhangMaZhong(index++),
  // new YuFan(index++),
  // new ZhuRan(index++),
];