import { PlayerCardsArea } from 'core/player/player_props';
import { Skill } from 'core/skills/skill';

export const enum CardSuit {
  NoSuit,
  Spade,
  Heart,
  Club,
  Diamond,
}

export type CardId = RealCardId | VirtualCardId;
export type RealCardId = number;
export type VirtualCardId = string;
export type CardProps = {
  number: number;
  suit: CardSuit;
  name: string;
  description: string;
  skills: Skill[];
};

export type CardChoosingOptions = {
  [Area in PlayerCardsArea]?: number | CardId[];
};

export type VirtualCardIdProps = {
  name: string;
  skillName?: string;
  containedCardIds: RealCardId[];
};