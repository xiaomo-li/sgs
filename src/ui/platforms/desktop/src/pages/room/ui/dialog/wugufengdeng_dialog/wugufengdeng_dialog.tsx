import { Card } from 'core/cards/card';
import { CardId } from 'core/cards/libs/card_props';
import { Sanguosha } from 'core/game/engine';
import { ClientTranslationModule } from 'core/translations/translation_module.client';
import { ClientCard } from 'pages/room/ui/card/card';
import * as React from 'react';
import { BaseDialog } from '../base_dialog';
import styles from './wugufengdeng_dialog.module.css';

type SelectedCardProps = {
  card: CardId;
  playerObjectText?: string;
};

type WuGuFengDengDialogProps = {
  translator: ClientTranslationModule;
  cards: CardId[];
  selected: SelectedCardProps[];
  onClick?(card: Card): void;
};

const getCardsContainerLines = ({ cards, selected, translator, onClick }: WuGuFengDengDialogProps) => {
  const onSelected = (card: Card) => (selected: boolean) => {
    onClick && onClick(card);
  };

  const maxCardsPerLine = Math.max(Math.round(cards.length / 2 + 0.5), 4);
  let index = 0;
  const cardsLine: JSX.Element[][] = [];
  while (index < cards.length) {
    const cardLine: JSX.Element[] = [];
    for (let i = index; i < Math.min(cards.length, maxCardsPerLine + index); i++) {
      const card = Sanguosha.getCardById(cards[i]);
      const isSelected = selected.find(selectedCard => selectedCard.card === card.Id);

      cardLine.push(
        <ClientCard
          card={card}
          key={i}
          translator={translator}
          disabled={isSelected !== undefined}
          onSelected={onSelected(card)}
          tag={isSelected?.playerObjectText}
        />,
      );
    }

    index += maxCardsPerLine;
    cardsLine.push(cardLine);
  }

  return cardsLine;
};

export const WuGuFengDengDialog = (props: WuGuFengDengDialogProps) => {
  return (
    <BaseDialog title={props.translator.tr('please choose a card')}>
      <div className={styles.cardContainer}>
        {getCardsContainerLines(props).map((cardsLine, index) => {
          return (
            <div className={styles.cardLine} key={index}>
              {cardsLine}
            </div>
          );
        })}
      </div>
    </BaseDialog>
  );
};