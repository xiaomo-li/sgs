import {
  CardLostReason,
  CardObtainedReason,
  ClientEventFinder,
  EventPacker,
  GameEventIdentifiers,
  ServerEventFinder,
  WorkPlace,
} from 'core/event/event';
import {
  AllStage,
  CardDropStage,
  CardResponseStage,
  CardUseStage,
  DrawCardStage,
  PinDianStage,
  PlayerPhase,
} from 'core/game/stage_processor';
import { ServerSocket } from 'core/network/socket.server';
import { Player } from 'core/player/player';
import { ServerPlayer } from 'core/player/player.server';
import { PlayerCardsArea, PlayerId, PlayerInfo, PlayerRole } from 'core/player/player_props';

import { Card, CardType, VirtualCard } from 'core/cards/card';
import { EquipCard } from 'core/cards/equip_card';
import { CardId, CardTargetEnum } from 'core/cards/libs/card_props';
import { Character } from 'core/characters/character';
import { PinDianResultType } from 'core/event/event.server';
import { Sanguosha } from 'core/game/engine';
import { GameInfo, getRoles } from 'core/game/game_props';
import { GameCommonRules } from 'core/game/game_rules';
import { CardLoader } from 'core/game/package_loader/loader.cards';
import { CharacterLoader } from 'core/game/package_loader/loader.characters';
import { Algorithm } from 'core/shares/libs/algorithm';
import { Functional } from 'core/shares/libs/functional';
import { Logger } from 'core/shares/libs/logger/logger';
import { Precondition } from 'core/shares/libs/precondition/precondition';
import { SkillType, TriggerSkill } from 'core/skills/skill';
import { UniqueSkillRule } from 'core/skills/skill_rule';
import { PatchedTranslationObject, TranslationPack } from 'core/translations/translation_json_tool';
import { GameProcessor } from '../game/game_processor';
import { Room, RoomId } from './room';

export class ServerRoom extends Room<WorkPlace.Server> {
  private loadedCharacters: Character[] = [];

  private drawStack: CardId[] = [];
  private dropStack: CardId[] = [];
  private round = 0;

  constructor(
    protected roomId: RoomId,
    protected gameInfo: GameInfo,
    protected socket: ServerSocket,
    protected gameProcessor: GameProcessor,
    protected players: Player[] = [],
    private logger: Logger,
  ) {
    super();
    this.init();
  }

  private onClosedCallback: () => void;

  protected init() {
    this.loadedCharacters = CharacterLoader.getInstance().getPackages(...this.gameInfo.characterExtensions);
    this.drawStack = CardLoader.getInstance()
      .getPackages(...this.gameInfo.cardExtensions)
      .map(card => card.Id);
    this.dropStack = [];

    this.socket.emit(this);
  }

  private shuffle() {
    if (this.dropStack.length > 0) {
      this.drawStack = this.drawStack.concat(this.dropStack);
      this.dropStack = [];
    }

    Algorithm.shuffle(this.drawStack);
  }

  private shuffleSeats() {
    Algorithm.shuffle(this.players);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].Position = i;
    }
    this.sortPlayers();
  }

  public assignRoles() {
    const roles = getRoles(this.gameInfo.numberOfPlayers);
    Algorithm.shuffle(roles);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].Role = roles[i];
    }
    const lordIndex = this.players.findIndex(player => player.Role === PlayerRole.Lord);
    if (lordIndex !== 0) {
      [this.players[0], this.players[lordIndex]] = [this.players[lordIndex], this.players[0]];
      [this.players[0].Position, this.players[lordIndex].Position] = [
        this.players[lordIndex].Position,
        this.players[0].Position,
      ];
    }
  }

  private readonly sleep = async (timeDuration: number) =>
    new Promise(r => {
      setTimeout(r, timeDuration);
    });

  public async gameStart() {
    this.shuffle();
    this.shuffleSeats();
    this.assignRoles();

    const event: ServerEventFinder<GameEventIdentifiers.GameReadyEvent> = {
      gameStartInfo: {
        numberOfDrawStack: this.DrawStack.length,
        round: 0,
        currentPlayerId: this.players[0].Id,
      },
      gameInfo: this.Info,
      playersInfo: this.Players.map(player => player.getPlayerInfo()),
      messages: ['game will start within 3 seconds'],
    };
    this.broadcast(GameEventIdentifiers.GameReadyEvent, event);

    this.gameStarted = true;
    await this.sleep(3000);
    await this.gameProcessor.gameStart(this, this.loadedCharacters);
  }

  public createPlayer(playerInfo: PlayerInfo) {
    const { Id, Name, Position, CharacterId } = playerInfo;
    this.players.push(new ServerPlayer(Id, Name, Position, CharacterId));
  }

  public clearSocketSubscriber(identifier: GameEventIdentifiers, to: PlayerId) {
    this.socket.clearSubscriber(identifier, to);
  }

  public notify<I extends GameEventIdentifiers>(type: I, content: ServerEventFinder<I>, to: PlayerId) {
    this.socket.notify(type, EventPacker.createIdentifierEvent(type, content), to);
  }

  public broadcast<I extends GameEventIdentifiers>(type: I, content: ServerEventFinder<I>) {
    if (this.isPlaying()) {
      content = EventPacker.wrapGameRunningInfo(content, {
        numberOfDrawStack: this.drawStack.length,
        round: this.round,
        currentPlayerId: this.CurrentPlayer.Id,
      });
    }

    this.socket.broadcast(type, EventPacker.createIdentifierEvent(type, content));
  }

  public async trigger<T = never>(
    content: T extends never ? ServerEventFinder<GameEventIdentifiers> : T,
    stage?: AllStage,
  ) {
    if (!this.CurrentPlayer || !this.isPlaying()) {
      return;
    }
    const { triggeredBySkills } = content as ServerEventFinder<GameEventIdentifiers>;
    const bySkills = triggeredBySkills
      ? triggeredBySkills.map(skillName => Sanguosha.getSkillBySkillName(skillName))
      : undefined;

    for (const player of this.getAlivePlayersFrom()) {
      const canTriggerSkills: TriggerSkill[] = [];
      for (const equip of player.getCardIds(PlayerCardsArea.EquipArea)) {
        const equipCard = Sanguosha.getCardById(equip);
        if (!(equipCard.Skill instanceof TriggerSkill)) {
          continue;
        }

        const canTrigger = bySkills
          ? bySkills.find(skill => !UniqueSkillRule.canTriggerCardSkillRule(skill, equipCard)) === undefined
          : UniqueSkillRule.canTriggerSkillRule(equipCard.Skill, player);
        if (canTrigger) {
          canTriggerSkills.push(equipCard.Skill);
        }
      }

      for (const skill of player.getPlayerSkills<TriggerSkill>('trigger')) {
        const canTrigger = bySkills
          ? bySkills.find(bySkill => !UniqueSkillRule.prohibitedBySkillRule(bySkill, skill)) === undefined
          : UniqueSkillRule.canTriggerSkillRule(skill, player);

        if (canTrigger) {
          canTriggerSkills.push(skill);
        }
      }

      for (const skill of canTriggerSkills) {
        if (EventPacker.isTerminated(content)) {
          break;
        }

        if (skill.isTriggerable(content, stage) && skill.canUse(this, player, content)) {
          const triggerSkillEvent: ServerEventFinder<GameEventIdentifiers.SkillUseEvent> = {
            fromId: player.Id,
            skillName: skill.Name,
            triggeredOnEvent: content,
          };
          if (
            skill.isAutoTrigger(content) ||
            skill.SkillType === SkillType.Compulsory ||
            skill.SkillType === SkillType.Awaken
          ) {
            await this.useSkill(triggerSkillEvent);
          } else {
            this.notify(
              GameEventIdentifiers.AskForSkillUseEvent,
              {
                invokeSkillNames: [skill.Name],
                toId: player.Id,
              },
              player.Id,
            );
            const { invoke, cardIds, toIds } = await this.onReceivingAsyncReponseFrom(
              GameEventIdentifiers.AskForSkillUseEvent,
              player.Id,
            );
            triggerSkillEvent.toIds = toIds;
            triggerSkillEvent.cardIds = cardIds;
            if (invoke) {
              await this.useSkill(triggerSkillEvent);
            }
          }
        }
      }
    }
  }

  public async onReceivingAsyncReponseFrom<T extends GameEventIdentifiers>(
    identifier: T,
    playerId: PlayerId,
  ): Promise<ClientEventFinder<T>> {
    return await this.socket.waitForResponse<T>(identifier, playerId);
  }

  public bury(...cardIds: CardId[]) {
    for (const cardId of cardIds) {
      if (this.getCardOwnerId(cardId) !== undefined) {
        continue;
      }

      if (Card.isVirtualCardId(cardId)) {
        this.bury(...Sanguosha.getCardById<VirtualCard>(cardId).ActualCardIds);
      } else {
        this.dropStack.push(cardId);
      }
    }
  }
  public isBuried(cardId: CardId): boolean {
    return this.dropStack.includes(cardId);
  }

  public putCards(place: 'top' | 'bottom', ...cardIds: CardId[]) {
    if (place === 'top') {
      for (let i = cardIds.length - 1; i >= 0; i--) {
        const cardId = cardIds[i];
        if (Card.isVirtualCardId(cardId)) {
          this.putCards(place, ...Sanguosha.getCardById<VirtualCard>(cardId).ActualCardIds);
        }
        this.drawStack.unshift(cardId);
      }
    } else {
      for (const cardId of cardIds) {
        if (Card.isVirtualCardId(cardId)) {
          this.putCards(place, ...Sanguosha.getCardById<VirtualCard>(cardId).ActualCardIds);
        } else {
          this.drawStack.push(cardId);
        }
      }
    }
  }

  public async equip(card: EquipCard, player: Player, passiveEquip?: boolean) {
    const prevEquipment = player.getEquipment(card.EquipType);
    if (prevEquipment !== undefined) {
      await this.dropCards(CardLostReason.PlaceToDropStack, [prevEquipment], player.Id);
    }
    if (!passiveEquip) {
      await this.loseCards([card.Id], player.Id, CardLostReason.CardUse);
    }

    const event: ServerEventFinder<GameEventIdentifiers.EquipEvent> = {
      fromId: player.Id,
      cardId: card.Id,
    };
    this.broadcast(GameEventIdentifiers.EquipEvent, event);
    player.equip(card);
  }

  public async askForCardUse(event: ServerEventFinder<GameEventIdentifiers.AskForCardUseEvent>, to: PlayerId) {
    EventPacker.createIdentifierEvent(GameEventIdentifiers.AskForCardUseEvent, event);
    await this.trigger<typeof event>(event);
    if (EventPacker.isTerminated(event)) {
      return {
        terminated: true,
      };
    }

    this.notify(GameEventIdentifiers.AskForCardUseEvent, event, to);

    return {
      responseEvent: await this.onReceivingAsyncReponseFrom(GameEventIdentifiers.AskForCardUseEvent, to),
    };
  }
  public async askForCardResponse(
    event: ServerEventFinder<GameEventIdentifiers.AskForCardResponseEvent>,
    to: PlayerId,
  ) {
    EventPacker.createIdentifierEvent(GameEventIdentifiers.AskForCardResponseEvent, event);
    await this.trigger<typeof event>(event);
    if (EventPacker.isTerminated(event)) {
      return {
        terminated: true,
      };
    }

    this.notify(GameEventIdentifiers.AskForCardResponseEvent, event, to);
    return {
      responseEvent: await this.onReceivingAsyncReponseFrom(GameEventIdentifiers.AskForCardResponseEvent, to),
    };
  }

  public async useCard(content: ServerEventFinder<GameEventIdentifiers.CardUseEvent>) {
    EventPacker.createIdentifierEvent(GameEventIdentifiers.CardUseEvent, content);

    await super.useCard(content);
    const from = this.getPlayerById(content.fromId);
    const card = Sanguosha.getCardById(content.cardId);
    if (card.is(CardType.Equip)) {
      await this.equip(card as EquipCard, from);
    } else if (!card.is(CardType.DelayedTrick)) {
      if (!this.getProcessingCards(content.cardId.toString()).includes(content.cardId)) {
        await this.loseCards([content.cardId], content.fromId, CardLostReason.CardUse);
      }
    }

    if (this.getProcessingCards(card.Id.toString()).length === 0) {
      this.addProcessingCards(card.Id.toString(), card.Id);
    }
    return await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.CardUseEvent, content, async stage => {
      if (stage === CardUseStage.AfterCardUseEffect) {
        if (EventPacker.isTerminated(content)) {
          return false;
        }

        if (content.toIds === undefined && card.AOE === CardTargetEnum.Single) {
          content.toIds = [content.fromId];
        }

        const onAim = async (...targets: PlayerId[]) => {
          const cardAimEvent: ServerEventFinder<GameEventIdentifiers.AimEvent> = {
            fromId: content.fromId,
            byCardId: content.cardId,
            toIds: targets,
          };

          await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.AimEvent, cardAimEvent);

          if (!EventPacker.isTerminated(cardAimEvent)) {
            if (cardAimEvent.triggeredBySkills) {
              content.triggeredBySkills = content.triggeredBySkills
                ? [...content.triggeredBySkills, ...cardAimEvent.triggeredBySkills]
                : cardAimEvent.triggeredBySkills;
            }
            return cardAimEvent.toIds;
          }

          return [];
        };

        if (card.AOE === CardTargetEnum.Single) {
          content.toIds = await onAim(
            ...Precondition.exists(content.toIds, `Invalid target number of card: ${card.Name}`),
          );
        } else {
          let newToIds: PlayerId[] = [];
          for (const toId of content.toIds || []) {
            newToIds = [...newToIds, ...(await onAim(toId))];
          }
          content.toIds = newToIds;
        }

        await card.Skill.beforeEffect(this, content);
        if ([CardTargetEnum.Others, CardTargetEnum.Multiple, CardTargetEnum.Globe].includes(card.AOE)) {
          for (const toId of content.toIds) {
            const cardEffectEvent: ServerEventFinder<GameEventIdentifiers.CardEffectEvent> = {
              ...content,
              toIds: [toId],
            };

            if (!card.is(CardType.DelayedTrick)) {
              await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.CardEffectEvent, cardEffectEvent);
            }
          }
        } else {
          if (!card.is(CardType.DelayedTrick) && !card.is(CardType.Equip)) {
            await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.CardEffectEvent, content);
          }
        }
        await card.Skill.afterEffect(this, content);
      } else if (stage === CardUseStage.CardUseFinishedEffect) {
        card.reset();
        this.endProcessOnTag(card.Id.toString());

        this.bury(card.Id);
      }

      return true;
    });
  }

  public async useSkill(content: ServerEventFinder<GameEventIdentifiers.SkillUseEvent>) {
    await super.useSkill(content);
    await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.SkillUseEvent, content);
    if (!EventPacker.isTerminated(content)) {
      await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.SkillEffectEvent, content);
    }
  }

  public loseSkill(playerId: PlayerId, skillName: string, broadcast?: boolean) {
    const player = this.getPlayerById(playerId);
    player.loseSkill(skillName);
    this.broadcast(GameEventIdentifiers.LoseSkillEvent, {
      toId: playerId,
      skillName,
      translationsMessage: broadcast
        ? TranslationPack.translationJsonPatcher('{0} lost skill {1}', player.Name, skillName).extract()
        : undefined,
    });
  }
  public obtainSkill(playerId: PlayerId, skillName: string, broadcast?: boolean) {
    const player = this.getPlayerById(playerId);
    player.obtainSkill(skillName);
    this.broadcast(GameEventIdentifiers.ObtainSkillEvent, {
      toId: playerId,
      skillName,
      translationsMessage: broadcast
        ? TranslationPack.translationJsonPatcher('{0} obtained skill {1}', player.Name, skillName).extract()
        : undefined,
    });
  }

  public async loseHp(playerId: PlayerId, lostHp: number) {
    await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.LoseHpEvent, {
      toId: playerId,
      lostHp,
    });
  }

  public getCards(numberOfCards: number, from: 'top' | 'bottom') {
    const cards: CardId[] = [];
    while (numberOfCards-- > 0) {
      if (this.drawStack.length === 0) {
        this.shuffle();
      }

      let card: CardId | undefined;
      if (from === 'top') {
        card = this.drawStack[0];
        this.drawStack.shift();
      } else {
        card = this.drawStack.pop();
      }
      cards.push(card!);
    }

    return cards;
  }

  public async drawCards(
    numberOfCards: number,
    playerId?: PlayerId,
    from: 'top' | 'bottom' = 'top',
    askedBy?: PlayerId,
    byReason?: string,
  ) {
    askedBy = askedBy || playerId || this.CurrentPlayer.Id;
    playerId = playerId || this.CurrentPlayer.Id;

    const drawEvent: ServerEventFinder<GameEventIdentifiers.DrawCardEvent> = {
      drawAmount: numberOfCards,
      fromId: playerId,
      askedBy,
      triggeredBySkills: byReason ? [byReason] : undefined,
    };

    let drawedCards: CardId[] = [];
    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.DrawCardEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.DrawCardEvent, drawEvent),
      async stage => {
        if (stage === DrawCardStage.CardDrawing) {
          drawedCards = this.getCards(drawEvent.drawAmount, from);
          await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.ObtainCardEvent, {
            reason: CardObtainedReason.CardDraw,
            cardIds: drawedCards,
            toId: drawEvent.fromId,
          });
        }

        return true;
      },
    );

    return drawedCards;
  }

  public async obtainCards(
    event: ServerEventFinder<GameEventIdentifiers.ObtainCardEvent>,
    doBroadcast: boolean = false,
  ) {
    if (event.cardIds.length === 0) {
      return;
    }

    event.givenBy = event.givenBy || event.fromId;
    event.translationsMessage =
      event.translationsMessage ||
      (doBroadcast
        ? TranslationPack.translationJsonPatcher(
            '{0} obtains cards {1}',
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.toId)),
            TranslationPack.patchCardInTranslation(...Card.getActualCards(event.cardIds)),
          ).extract()
        : undefined);
    event.cardIds = Card.getActualCards(event.cardIds);
    EventPacker.createIdentifierEvent(GameEventIdentifiers.ObtainCardEvent, event);

    await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.ObtainCardEvent, event);
    this.dropStack = this.dropStack.filter(cardId => !event.cardIds.includes(cardId));
    this.drawStack = this.drawStack.filter(cardId => !event.cardIds.includes(cardId));
  }

  public async dropCards(
    reason: CardLostReason,
    cardIds: CardId[],
    playerId?: PlayerId,
    droppedBy?: PlayerId,
    byReason?: string,
  ) {
    if (cardIds.length === 0) {
      return;
    }

    droppedBy = droppedBy || playerId || this.CurrentPlayer.Id;
    playerId = playerId || this.CurrentPlayer.Id;

    const dropEvent: ServerEventFinder<GameEventIdentifiers.CardDropEvent> = {
      cardIds,
      fromId: playerId,
      droppedBy,
      triggeredBySkills: byReason ? [byReason] : undefined,
    };

    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.CardDropEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.CardDropEvent, dropEvent),
      async stage => {
        if (stage === CardDropStage.CardDropping) {
          await this.loseCards(cardIds, playerId!, reason, droppedBy);
          this.bury(...cardIds);
        }

        return true;
      },
    );
  }

  public async loseCards(
    cardIds: CardId[],
    from: PlayerId,
    reason: CardLostReason,
    droppedBy?: PlayerId,
    moveReason?: string,
    customMessmage?: PatchedTranslationObject,
    doBroadcast: boolean = false,
  ) {
    if (cardIds.length === 0) {
      return;
    }
    const player = this.getPlayerById(from);
    const actualCards = Card.getActualCards(cardIds);

    const event: ServerEventFinder<GameEventIdentifiers.CardLostEvent> = {
      cards: actualCards.map(cardId => ({ cardId, fromArea: player.cardFrom(cardId) })),
      reason,
      fromId: from,
      droppedBy,
      translationsMessage: customMessmage,
      triggeredBySkills: moveReason ? [moveReason] : undefined,
    };

    event.translationsMessage =
      event.translationsMessage ||
      (doBroadcast
        ? (event.translationsMessage = TranslationPack.translationJsonPatcher(
            '{0} lost card {1}',
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.fromId)),
            TranslationPack.patchCardInTranslation(...Card.getActualCards(cardIds)),
          ).extract())
        : undefined);
    EventPacker.createIdentifierEvent(GameEventIdentifiers.CardLostEvent, event);

    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.CardLostEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.CardLostEvent, event),
    );
  }

  public async turnOver(playerId: PlayerId) {
    const turnOverEvent: ServerEventFinder<GameEventIdentifiers.PlayerTurnOverEvent> = {
      toId: playerId,
    };

    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.PlayerTurnOverEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.PlayerTurnOverEvent, turnOverEvent),
    );
  }

  public async moveCards(
    cardIds: CardId[],
    fromId: PlayerId | undefined,
    toId: PlayerId,
    fromReason: CardLostReason | undefined,
    fromArea: PlayerCardsArea | undefined,
    toArea: PlayerCardsArea,
    toReason: CardObtainedReason | undefined,
    proposer?: PlayerId,
    moveReasion?: string,
  ) {
    const to = this.getPlayerById(toId);
    const from = fromId && this.getPlayerById(fromId);

    if (from) {
      let doBroadcast = false;
      if (
        fromArea !== PlayerCardsArea.HandArea &&
        fromReason !== undefined &&
        ![CardLostReason.CardResponse, CardLostReason.CardUse].includes(fromReason)
      ) {
        doBroadcast = true;
      }

      fromReason = Precondition.exists(fromReason, 'Unknown card move from reason');
      if (fromArea !== PlayerCardsArea.JudgeArea) {
        await this.loseCards(cardIds, from.Id, fromReason, proposer, moveReasion, undefined, doBroadcast);
      } else {
        this.broadcast(GameEventIdentifiers.CardLostEvent, {
          fromId: from.Id,
          cards: cardIds.map(cardId => ({ cardId })),
          droppedBy: proposer,
          reason: fromReason,
          translationsMessage: TranslationPack.translationJsonPatcher(
            '{0} lost card {1}',
            TranslationPack.patchPlayerInTranslation(from),
            TranslationPack.patchCardInTranslation(...cardIds),
          ).extract(),
        });
        from.dropCards(...cardIds);
      }
    }

    if (toArea == PlayerCardsArea.JudgeArea) {
      this.broadcast(GameEventIdentifiers.MoveCardEvent, {
        fromId,
        toId,
        fromArea,
        toArea,
        cardIds,
      });
      for (const cardId of cardIds) {
        to.getCardIds(toArea).push(cardId);
      }
    } else if (toArea === PlayerCardsArea.EquipArea) {
      for (const cardId of cardIds) {
        await this.equip(Sanguosha.getCardById<EquipCard>(cardId), to, from !== to);
      }
    } else if (toArea === PlayerCardsArea.HandArea) {
      await this.obtainCards({
        reason: toReason!,
        cardIds,
        toId,
        fromId,
        triggeredBySkills: moveReasion ? [moveReasion] : undefined,
        translationsMessage: TranslationPack.translationJsonPatcher(
          '{0} obtains cards {1}' + (fromId ? ' from {2}' : ''),
          TranslationPack.patchPlayerInTranslation(to),
          TranslationPack.patchCardInTranslation(...Card.getActualCards(cardIds)),
          fromId ? TranslationPack.patchPlayerInTranslation(this.getPlayerById(fromId)) : '',
        ).extract(),
        unengagedMessage: TranslationPack.translationJsonPatcher(
          '{0} obtains {1} cards' + (fromId ? ' from {2}' : ''),
          TranslationPack.patchPlayerInTranslation(to),
          cardIds.length,
          fromId ? TranslationPack.patchPlayerInTranslation(this.getPlayerById(fromId)) : '',
        ).extract(),
        engagedPlayerIds: fromId !== undefined ? [toId, fromId] : [toId],
      });
    } else {
      //TODO: refactor if there are any needs for outside area
      for (const cardId of cardIds) {
        to.getCardIds(toArea).push(cardId);
      }
    }
  }

  public async damage(event: ServerEventFinder<GameEventIdentifiers.DamageEvent>): Promise<void> {
    EventPacker.createIdentifierEvent(GameEventIdentifiers.DamageEvent, event);

    event.translationsMessage =
      event.fromId === undefined
        ? TranslationPack.translationJsonPatcher(
            '{0} got hurt for {1} hp with {2} property',
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.toId)),
            event.damage,
            event.damageType,
          ).extract()
        : TranslationPack.translationJsonPatcher(
            '{0} hits {1} {2} hp of damage type {3}',
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.fromId)),
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.toId)),
            event.damage,
            event.damageType,
          ).extract();

    await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.DamageEvent, event);
  }

  public async recover(event: ServerEventFinder<GameEventIdentifiers.RecoverEvent>): Promise<void> {
    const to = this.getPlayerById(event.toId);
    if (to.Hp === to.MaxHp) {
      return;
    }

    event.translationsMessage =
      event.recoverBy !== undefined
        ? TranslationPack.translationJsonPatcher(
            '{0} recovered {2} hp for {1}',
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.recoverBy)),
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.toId)),
            event.recoveredHp,
          ).extract()
        : TranslationPack.translationJsonPatcher(
            '{0} recovered {1} hp',
            TranslationPack.patchPlayerInTranslation(this.getPlayerById(event.toId)),
            event.recoveredHp,
          ).extract();

    await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.RecoverEvent, event);
  }

  public async responseCard(event: ServerEventFinder<GameEventIdentifiers.CardResponseEvent>): Promise<void> {
    EventPacker.createIdentifierEvent(GameEventIdentifiers.CardResponseEvent, event);
    await this.gameProcessor.onHandleIncomingEvent(GameEventIdentifiers.CardResponseEvent, event, async stage => {
      if (stage === CardResponseStage.AfterCardResponseEffect) {
        if (event.responseToEvent) {
          EventPacker.terminate(event.responseToEvent);
          return false;
        }
      }

      return true;
    });

    if (!this.getProcessingCards(event.cardId.toString()).includes(event.cardId)) {
      await this.loseCards([event.cardId], event.fromId, CardLostReason.CardResponse);
      this.bury(event.cardId);
    }
  }

  public async judge(
    to: PlayerId,
    byCard?: CardId,
    bySkill?: string,
  ): Promise<ServerEventFinder<GameEventIdentifiers.JudgeEvent>> {
    const judgeCardId = this.getCards(1, 'top')[0];
    const event: ServerEventFinder<GameEventIdentifiers.JudgeEvent> = {
      toId: to,
      judgeCardId,
      byCard,
      bySkill,
    };

    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.JudgeEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.JudgeEvent, event),
    );
    this.bury(event.judgeCardId);

    return event;
  }

  public async pindian(fromId: PlayerId, toIds: PlayerId[]) {
    let pindianResult: PinDianResultType | undefined;
    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.AskForPinDianCardEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.AskForPinDianCardEvent, { fromId, toIds }),
      async stage => {
        if (stage === PinDianStage.PinDianEffect) {
          const targets = [fromId, ...toIds];
          for (const target of targets) {
            this.notify(
              GameEventIdentifiers.AskForPinDianCardEvent,
              {
                fromId,
                toIds: targets,
              },
              target,
            );
          }

          const responses = await Promise.all(
            targets.map(to => this.onReceivingAsyncReponseFrom(GameEventIdentifiers.AskForPinDianCardEvent, to)),
          );

          let winner: PlayerId | undefined;
          let largestCardNumber = 0;
          const pindianCards: {
            fromId: string;
            cardId: CardId;
          }[] = [];

          for (const result of responses) {
            const pindianCard = Sanguosha.getCardById(result.pindianCard);
            if (pindianCard.CardNumber > largestCardNumber) {
              largestCardNumber = pindianCard.CardNumber;
              winner = result.fromId;
            } else if (pindianCard.CardNumber === largestCardNumber) {
              winner = undefined;
            }

            pindianCards.push({
              fromId: result.fromId,
              cardId: result.pindianCard,
            });
          }

          pindianResult = {
            winner,
            pindianCards,
          };
        }

        return true;
      },
    );

    if (pindianResult !== undefined) {
      const pindianResultEvent: ServerEventFinder<GameEventIdentifiers.PinDianEvent> = {
        attackerId: fromId,
        result: pindianResult,
      };
      this.broadcast(GameEventIdentifiers.PinDianEvent, pindianResultEvent);
    }
    return pindianResult;
  }

  public skip(player: PlayerId, phase?: PlayerPhase) {
    if (this.CurrentPhasePlayer.Id === player) {
      this.gameProcessor.skip(phase);
    }
  }

  public syncGameCommonRules(playerId: PlayerId, updateActions: (user: Player) => void) {
    const player = this.getPlayerById(playerId);
    updateActions(player);
    this.notify(
      GameEventIdentifiers.SyncGameCommonRulesEvent,
      {
        toId: playerId,
        commonRules: GameCommonRules.toSocketObject(player),
      },
      playerId,
    );
  }

  public async kill(deadPlayer: Player, killedBy?: PlayerId) {
    const playerDiedEvent: ServerEventFinder<GameEventIdentifiers.PlayerDiedEvent> = {
      playerId: deadPlayer.Id,
      killedBy,
      messages: [
        TranslationPack.translationJsonPatcher(
          '{0} was killed' + (killedBy === undefined ? '' : ' by {1}'),
          TranslationPack.patchPlayerInTranslation(deadPlayer),
          killedBy ? TranslationPack.patchPlayerInTranslation(this.getPlayerById(killedBy)) : '',
        ).toString(),
      ],
      translationsMessage: TranslationPack.translationJsonPatcher(
        'the role of {0} is {1}',
        TranslationPack.patchPlayerInTranslation(deadPlayer),
        Functional.getPlayerRoleRawText(deadPlayer.Role),
      ).extract(),
    };

    await this.gameProcessor.onHandleIncomingEvent(
      GameEventIdentifiers.PlayerDiedEvent,
      EventPacker.createIdentifierEvent(GameEventIdentifiers.PlayerDiedEvent, playerDiedEvent),
    );
  }

  public clearFlags(player: PlayerId) {
    this.broadcast(GameEventIdentifiers.ClearFlagEvent, {
      to: player,
    });
    super.clearFlags(player);
  }
  public removeFlag(player: PlayerId, name: string) {
    this.broadcast(GameEventIdentifiers.RemoveFlagEvent, {
      to: player,
      name,
    });
    super.removeFlag(player, name);
  }
  public setFlag<T>(player: PlayerId, name: string, value: T, invisible: boolean = true): T {
    this.broadcast(GameEventIdentifiers.SetFlagEvent, {
      to: player,
      value,
      name,
      invisible,
    });
    return super.setFlag(player, name, value);
  }
  public getFlag<T>(player: PlayerId, name: string): T {
    return this.getPlayerById(player).getFlag(name);
  }

  public clearMarks(player: PlayerId) {
    this.broadcast(GameEventIdentifiers.ClearMarkEvent, {
      to: player,
    });
    super.clearMarks(player);
  }
  public removeMark(player: PlayerId, name: string) {
    this.broadcast(GameEventIdentifiers.RemoveMarkEvent, {
      to: player,
      name,
    });
    super.removeMark(player, name);
  }
  public setMark(player: PlayerId, name: string, value: number) {
    this.broadcast(GameEventIdentifiers.SetMarkEvent, {
      to: player,
      name,
      value,
    });
    return super.setMark(player, name, value);
  }
  public addMark(player: PlayerId, name: string, value: number) {
    this.broadcast(GameEventIdentifiers.AddMarkEvent, {
      to: player,
      value,
      name,
    });
    return super.addMark(player, name, value);
  }

  public get CurrentPhasePlayer() {
    return this.gameProcessor.CurrentPhasePlayer;
  }

  public get CurrentPlayerPhase() {
    return this.gameProcessor.CurrentPlayerPhase;
  }

  public get CurrentPlayerStage() {
    return this.gameProcessor.CurrentPlayerStage;
  }

  public get CurrentPlayer(): Player {
    return this.gameProcessor.CurrentPlayer;
  }

  public get DrawStack(): ReadonlyArray<CardId> {
    return this.drawStack;
  }
  public get DropStack(): ReadonlyArray<CardId> {
    return this.dropStack;
  }

  public get Logger(): Readonly<Logger> {
    return this.logger;
  }

  public close() {
    this.onClosedCallback && this.onClosedCallback();
  }

  public onClosed(fn: () => void) {
    this.onClosedCallback = fn;
  }
}
