const gameMessageTranslations = {
  standard_character_package: '标准版',
  standard_card_package: '标准包',
  slash: '杀',
  jink: '闪',
  peach: '桃',
  wine: '酒',
  '{0} activates skill {1}': '{0} 发动了技能【{1}】',
  sunquan: '孙权',
  zhiheng: '制衡',
  '{0} hurts {1} for {2} {3} hp': '{0} 对 {1} 造成了 {2} 点【{3}】伤害',
  '{0} got hits from {1} by {2} {3} hp':
    '{0} 受到了来自 {1} 的 {2} 点【{3}】伤害',
  '{0} got hits by {1} {2} hp': '{0} 受到了 {1} 点【{2}】伤害',
  '{0} droppes cards {1}': '{0} 弃置了 {1}',
  '{0} cards are dropped': '{0} 进入了弃牌堆',
  '{0} uses card {1}': '{0} 使用了一张【{1}】',
  '{0} obtains card {1}': '{0} 获得了【{1}】',
  '{0} uses card {2} to {1}': '{0} 对 {1} 使用了一张【{2}】',
  '{0} responses card {1}': '{0} 打出了一张【{0}】',
  'please drop {0} cards': '请弃置 {0} 张牌',
  'do you want to use nullification to {1} from {0}':
    '是否对 {0} 的【{1}】使用【无懈可击】',
  '{0} asks for a peach': '{0} 处于濒死阶段，是否对其使用一个【桃】？',
  '{0} recovers {1} hp': '{0} 恢复了 {1} 点体力',
  ',': '，',
  normal_propery: '普通',
  thunder_propery: '雷属性',
  fire_propery: '火属性',
};

const gameUITranslations = {
  'No rooms at the moment': '还没有玩家创建房间',
  'Create a room': '创建信房间',
  'standard': '标准',
  'waiting': '等待',
  'playing': '游戏中',
};

export const translations = {
  ...gameMessageTranslations,
  ...gameUITranslations,
};
