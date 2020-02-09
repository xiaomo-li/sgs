import { TranslationPack } from 'core/translations/translation_json_tool';
import { ClientEvent } from './event.client';
import { ServerEvent } from './event.server';

export const enum GameEventIdentifiers {
  UserMessageEvent,
  PhaseChangeEvent,

  CardDropEvent,
  CardResponseEvent,
  CardUseEvent,
  CardEffectEvent,
  CardDisplayEvent,
  DrawCardEvent,
  ObtainCardEvent,
  MoveCardEvent,

  AimEvent,

  SkillUseEvent,
  SkillEffectEvent,
  PinDianEvent,
  LoseHpEvent,
  DamageEvent,
  RecoverEvent,
  JudgeEvent,

  GameStartEvent,
  GameOverEvent,
  PlayerEnterEvent,
  PlayerLeaveEvent,
  PlayerDyingEvent,
  PlayerDiedEvent,

  AskForPeachEvent,
  AskForWuXieKeJiEvent,
  AskForCardResponseEvent,
  AskForCardUseEvent,
  AskForCardDisplayEvent,
  AskForCardDropEvent,
  AskForPinDianCardEvent,
  AskForChoosingCardEvent,
  AskForChoosPlayerEvent,
  AskForChooseOptionsEvent,
  AskForChoosingCardFromPlayerEvent,
  AskForInvokeEvent,
  AskForChooseCharacterEvent,
  AskForPlaceCardsInDileEvent,
}

export type CardResponsiveEventIdentifiers =
  | GameEventIdentifiers.AskForPeachEvent
  | GameEventIdentifiers.AskForWuXieKeJiEvent
  | GameEventIdentifiers.AskForCardResponseEvent
  | GameEventIdentifiers.AskForCardUseEvent;

export const isCardResponsiveIdentifier = (
  identifier: GameEventIdentifiers,
): identifier is CardResponsiveEventIdentifiers => {
  return [
    GameEventIdentifiers.AskForPeachEvent,
    GameEventIdentifiers.AskForWuXieKeJiEvent,
    GameEventIdentifiers.AskForCardResponseEvent,
    GameEventIdentifiers.AskForCardUseEvent,
  ].includes(identifier);
};

export const createGameEventIdentifiersStringList = () => {
  const list: string[] = [];
  for (let i = 0; i <= GameEventIdentifiers.AskForPlaceCardsInDileEvent; i++) {
    list.push(i.toString());
  }

  return list;
};

export const enum WorkPlace {
  Client,
  Server,
}

export type BaseGameEvent = {
  triggeredBySkillName?: string;
  messages?: string[];
  translationsMessage?: TranslationPack;
};

export type EventUtilities = {
  [K in keyof typeof GameEventIdentifiers]: object;
};

export type EventPicker<
  I extends GameEventIdentifiers,
  E extends WorkPlace
> = BaseGameEvent &
  (E extends WorkPlace.Client ? ClientEvent[I] : ServerEvent[I]);

export type ClientEventFinder<I extends GameEventIdentifiers> = BaseGameEvent &
  ClientEvent[I];
export type ServerEventFinder<I extends GameEventIdentifiers> = BaseGameEvent &
  ServerEvent[I];

export class EventPacker {
  private constructor() {}

  static isDisresponsiveEvent = <T extends GameEventIdentifiers>(
    event: ServerEventFinder<T>,
  ) => {
    return EventPacker.hasFlag('disresponsive', event);
  };

  static setDisresponsiveEvent = <T extends GameEventIdentifiers>(
    event: ServerEventFinder<T>,
  ): ServerEventFinder<T> => {
    (event as any).disresponsive = true;
    return event;
  };

  static addFlag = <T extends GameEventIdentifiers>(
    property: string,
    event: ServerEventFinder<T>,
  ): ServerEventFinder<T> => {
    (event as any)[property] = true;
    return event;
  };

  static hasFlag = <T extends GameEventIdentifiers>(
    property: string,
    event: ServerEventFinder<T>,
  ): boolean => {
    return property in event;
  };

  static removeFlag = <T extends GameEventIdentifiers>(
    property: string,
    event: ServerEventFinder<T>,
  ): ServerEventFinder<T> => {
    delete event[property];
    return event;
  };

  static createUncancellableEvent = <T extends GameEventIdentifiers>(
    event: ServerEventFinder<T>,
  ): ServerEventFinder<T> => {
    (event as any).uncancellable = true;
    return event;
  };

  static createIdentifierEvent = <T extends GameEventIdentifiers>(
    identifier: T,
    event: ServerEventFinder<T>,
  ): ServerEventFinder<T> => {
    (event as any).identifier = identifier;
    return event;
  };

  static hasIdentifier = <T extends GameEventIdentifiers>(
    identifier: T,
    event: ServerEventFinder<T>,
  ): boolean => {
    return (event as any).identifier === identifier;
  };

  static getIdentifier = <T extends GameEventIdentifiers>(
    event: ServerEventFinder<T>,
  ): T | undefined => {
    return (event as any).identifier;
  };

  static isUncancellabelEvent = (
    event: ServerEventFinder<GameEventIdentifiers>,
  ) => {
    return !!(event as any).uncancellable;
  };

  static terminate<T extends EventPicker<GameEventIdentifiers, WorkPlace>>(
    event: T,
  ): T {
    (event as any).terminate = true;
    return event;
  }

  static isTerminated(event: EventPicker<GameEventIdentifiers, WorkPlace>) {
    return !!(event as any).terminate;
  }
}
