import { VirtualCard } from 'core/cards/card';
import { CardId, CardSuit } from 'core/cards/libs/card_props';
import { Sanguosha } from 'core/game/engine';
import { CompulsorySkill, TransformSkill } from 'core/skills/skill';

@CompulsorySkill
export class HongYan extends TransformSkill {
  constructor() {
    super('hongyan', 'hongyan_description');
  }

  public forceToTransformCardTo(cardId: CardId) {
    const card = Sanguosha.getCardById(cardId);
    if (card.Suit === CardSuit.Spade) {
      return VirtualCard.create(card.Name, [cardId]);
    }
    return card;
  }
}
