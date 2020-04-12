import { PlayerAI } from 'core/ai/ai';
import { Card, CardType } from 'core/cards/card';
import { EquipCard, WeaponCard } from 'core/cards/equip_card';
import { CardMatcher } from 'core/cards/libs/card_matcher';
import { CardId } from 'core/cards/libs/card_props';
import { Character, CharacterGender, CharacterId, CharacterNationality } from 'core/characters/character';
import { Sanguosha } from 'core/game/engine';
import { GameCommonRules } from 'core/game/game_rules';
import {
  PlayerCards,
  PlayerCardsArea,
  PlayerCardsOutside,
  PlayerId,
  PlayerInfo,
  PlayerRole,
} from 'core/player/player_props';
import { Room } from 'core/room/room';
import { Precondition } from 'core/shares/libs/precondition/precondition';
import {
  ActiveSkill,
  FilterSkill,
  RulesBreakerSkill,
  Skill,
  SkillType,
  TransformSkill,
  TriggerSkill,
  ViewAsSkill,
} from 'core/skills/skill';

type SkillStringType =
  | 'trigger'
  | 'common'
  | 'limit'
  | 'awaken'
  | 'complusory'
  | 'active'
  | 'filter'
  | 'breaker'
  | 'transform'
  | 'viewAs';

export abstract class Player implements PlayerInfo {
  private hp: number;
  private maxHp: number;
  private dead: boolean;
  private chainLocked: boolean = false;
  private turnedOver: boolean = false;
  private playerSkills: Skill[] = [];
  private gender: CharacterGender;
  private online: boolean;
  private ai: PlayerAI = PlayerAI.Instance;

  private drunk: number = 0;

  protected abstract playerId: PlayerId;
  protected abstract playerName: string;
  protected abstract playerPosition: number;
  protected playerRole: PlayerRole = PlayerRole.Unknown;
  protected nationality: CharacterNationality;

  private cardUseHistory: CardId[] = [];
  private skillUsedHistory: {
    [K: string]: number;
  }[] = [];
  private playerCharacter: Character | undefined;
  protected playerCards: PlayerCards;
  protected playerOutsideCards: PlayerCardsOutside;

  private flags: {
    [k: string]: any;
  } = {};
  private marks: {
    [markName: string]: number;
  } = {};

  constructor(
    playerCards?: PlayerCards & {
      [PlayerCardsArea.OutsideArea]: PlayerCardsOutside;
    },
    protected playerCharacterId?: CharacterId,
  ) {
    if (playerCards) {
      this.playerCards = {
        [PlayerCardsArea.HandArea]: playerCards[PlayerCardsArea.HandArea],
        [PlayerCardsArea.JudgeArea]: playerCards[PlayerCardsArea.JudgeArea],
        [PlayerCardsArea.EquipArea]: playerCards[PlayerCardsArea.EquipArea],
      };
      this.playerOutsideCards = playerCards[PlayerCardsArea.OutsideArea];
    } else {
      this.playerCards = {
        [PlayerCardsArea.HandArea]: [],
        [PlayerCardsArea.JudgeArea]: [],
        [PlayerCardsArea.EquipArea]: [],
      };
      this.playerOutsideCards = {};
    }

    if (this.playerCharacterId) {
      this.playerCharacter = Sanguosha.getCharacterById(this.playerCharacterId);
      this.hp = this.playerCharacter.MaxHp;
      this.maxHp = this.playerCharacter.MaxHp;
      this.nationality = this.playerCharacter.Nationality;
      this.gender = this.playerCharacter.Gender;
    }

    this.dead = false;
    this.online = true;

    GameCommonRules.initPlayerCommonRules(this);
  }

  public clearFlags() {
    this.flags = {};
  }
  removeFlag(name: string) {
    delete this.flags[name];
  }
  setFlag<T>(name: string, value: T): T {
    return (this.flags[name] = value);
  }
  getFlag<T>(name: string): T {
    return this.flags[name];
  }

  public clearMarks() {
    this.marks = {};
  }
  removeMark(name: string) {
    delete this.marks[name];
  }
  setMark(name: string, value: number) {
    return (this.marks[name] = value);
  }
  addMark(name: string, value: number) {
    if (this.marks[name] === undefined) {
      this.marks[name] = value;
    } else {
      this.marks[name] += value;
    }
    return this.marks[name];
  }
  getMark(name: string) {
    return this.marks[name] || 0;
  }
  addInvisibleMark(name: string, value: number) {
    return this.addMark('#' + name, value);
  }
  getInvisibleMark(name: string) {
    return this.getMark('#' + name);
  }
  removeInvisibleMark(name: string) {
    this.removeMark('#' + name);
  }

  public canUseCard(room: Room, cardId: CardId | CardMatcher): boolean {
    const card = cardId instanceof CardMatcher ? undefined : Sanguosha.getCardById(cardId);
    const ruleCardUse = GameCommonRules.canUse(
      this,
      cardId instanceof CardMatcher ? cardId : Sanguosha.getCardById(cardId),
    );

    if (card) {
      return ruleCardUse && (card.is(CardType.Equip) ? true : card.Skill.canUse(room, this));
    }

    return ruleCardUse;
  }

  public resetCardUseHistory() {
    this.cardUseHistory = [];
  }

  public resetSkillUseHistory(skillName: string) {
    this.skillUsedHistory[skillName] = 0;
  }

  public useCard(cardId: CardId) {
    this.cardUseHistory.push(cardId);
  }

  public useSkill(skillName: string) {
    this.skillUsedHistory[skillName] !== undefined
      ? this.skillUsedHistory[skillName]++
      : (this.skillUsedHistory[skillName] = 1);
  }

  public getCardIds(area?: PlayerCardsArea, outsideAreaName?: string): CardId[] {
    if (area === undefined) {
      const [handCards, judgeCards, equipCards] = Object.values<CardId[]>(this.playerCards);
      return [...handCards, ...judgeCards, ...equipCards];
    }

    if (area !== PlayerCardsArea.OutsideArea) {
      return this.playerCards[area];
    } else {
      outsideAreaName = Precondition.exists(outsideAreaName, 'Unable to get undefined area cards');

      return this.playerOutsideCards[outsideAreaName];
    }
  }

  public getPlayerCards(): CardId[] {
    return [...this.playerCards[PlayerCardsArea.EquipArea], ...this.playerCards[PlayerCardsArea.HandArea]];
  }

  public getWeaponCardId(): CardId | undefined {
    return this.playerCards[PlayerCardsArea.EquipArea].find(card => Sanguosha.getCardById(card).is(CardType.Weapon));
  }

  public getCardId(cardId: CardId): CardId | undefined {
    for (const card of Object.values(this.getCardIds())) {
      if (card === cardId) {
        return cardId;
      }
    }
  }

  public cardFrom(cardId: CardId): PlayerCardsArea | undefined {
    for (const [area, cards] of Object.entries(this.playerCards) as [string, CardId[]][]) {
      if (cards.find(card => card === cardId)) {
        return parseInt(area, 10) as PlayerCardsArea;
      }
    }
  }

  public obtainCardIds(...cards: CardId[]) {
    const handCards = this.getCardIds(PlayerCardsArea.HandArea);
    for (const card of Card.getActualCards(cards)) {
      handCards.push(card);
    }
  }

  dropCards(...cards: CardId[]): CardId[] {
    const droppedCardIds: CardId[] = [];
    const actualCards = Card.getActualCards(cards);
    for (const area of [PlayerCardsArea.HandArea, PlayerCardsArea.EquipArea, PlayerCardsArea.JudgeArea]) {
      const areaCards = this.getCardIds(area);
      for (const card of actualCards) {
        if (Card.isVirtualCardId(card)) {
          continue;
        }

        const index = areaCards.findIndex(areaCard => areaCard === card);
        if (index >= 0) {
          droppedCardIds.push(areaCards.splice(index, 1)[0]);
        }
      }
    }

    const untrackedCards = actualCards.filter(card => !droppedCardIds.includes(card));
    if (untrackedCards.length > 0) {
      throw new Error(`Can't drop card ${JSON.stringify(untrackedCards)} from player ${this.Name}`);
    }

    return droppedCardIds;
  }

  public equip(equipCard: EquipCard) {
    const currentEquipIndex = this.playerCards[PlayerCardsArea.EquipArea].findIndex(card =>
      Sanguosha.getCardById<EquipCard>(card).is(equipCard.EquipType),
    );
    let lostEquipId: CardId | undefined;
    if (currentEquipIndex >= 0) {
      lostEquipId = this.playerCards[PlayerCardsArea.EquipArea].splice(currentEquipIndex, 1)[0] as CardId;
    }

    const equipCardFromHandsIndex = this.playerCards[PlayerCardsArea.HandArea].findIndex(
      cardId => equipCard.Id === cardId,
    );
    if (equipCardFromHandsIndex >= 0) {
      this.playerCards[PlayerCardsArea.HandArea].splice(equipCardFromHandsIndex, 1);
    }

    this.playerCards[PlayerCardsArea.EquipArea].push(equipCard.Id);
    return lostEquipId;
  }

  public getDrunk() {
    this.drunk++;
  }
  public hasDrunk() {
    return this.drunk;
  }
  public clearHeaded() {
    this.drunk = 0;
  }

  public getEquipment(cardType: CardType): CardId | undefined {
    return this.playerCards[PlayerCardsArea.EquipArea].find(cardId => Sanguosha.getCardById(cardId).is(cardType));
  }

  public hasCard(cardMatcherOrId: CardId | CardMatcher, areas?: PlayerCardsArea, outsideName?: string) {
    if (cardMatcherOrId instanceof CardMatcher) {
      const findCard = this.getCardIds(areas, outsideName).find(cardId => {
        const card = Sanguosha.getCardById(cardId);
        return cardMatcherOrId.match(card);
      });

      if (findCard) {
        return true;
      }

      const skill = this.getSkills<ViewAsSkill>('viewAs').find(skill => {
        const viewAsCards = skill.canViewAs();
        return CardMatcher.match(CardMatcher.addTag({ name: viewAsCards }), cardMatcherOrId);
      });

      return !!skill;
    } else {
      if (this.getCardId(cardMatcherOrId) !== undefined) {
        return true;
      }

      const card = Sanguosha.getCardById(cardMatcherOrId);
      const skill = this.getSkills<ViewAsSkill>('viewAs').find(skill => skill.canViewAs().includes(card.GeneralName));

      return !!skill;
    }
  }

  public hasUsed(cardName: string): boolean {
    return this.cardUseHistory.find(cardId => Sanguosha.getCardById(cardId).Name === cardName) !== undefined;
  }
  public cardUsedTimes(cardSkillName: CardId | CardMatcher): number {
    const trendToUse = cardSkillName instanceof CardMatcher ? cardSkillName : Sanguosha.getCardById(cardSkillName);
    return this.cardUseHistory.filter(cardId => {
      const card = Sanguosha.getCardById(cardId);
      return trendToUse instanceof CardMatcher ? trendToUse.match(card) : card.GeneralName === trendToUse.GeneralName;
    }).length;
  }

  public hasUsedSkill(skillName: string): boolean {
    return this.skillUsedHistory[skillName] && this.skillUsedHistory[skillName] > 0;
  }
  public hasUsedSkillTimes(skillName: string): number {
    return this.skillUsedHistory[skillName] === undefined ? 0 : this.skillUsedHistory[skillName];
  }

  public get AttackDistance() {
    let attackDistance = this.getOffenseDistance();

    for (const cardId of this.getCardIds(PlayerCardsArea.EquipArea)) {
      const card = Sanguosha.getCardById(cardId);
      if (card instanceof WeaponCard) {
        attackDistance += card.AttackDistance;
      }
    }

    return Math.max(attackDistance + GameCommonRules.getAdditionalAttackDistance(this), 1);
  }

  public getOffenseDistance() {
    return GameCommonRules.getAdditionalOffenseDistance(this);
  }

  public getDefenseDistance() {
    return GameCommonRules.getAdditionalDefenseDistance(this);
  }

  public getCardUsableDistance(cardId: CardId) {
    const card = Sanguosha.getCardById(cardId);
    return card.EffectUseDistance + GameCommonRules.getCardAdditionalUsableDistance(card, this);
  }

  public getCardAdditionalUsableNumberOfTargets(cardId: CardId | CardMatcher) {
    const card = cardId instanceof CardMatcher ? cardId : Sanguosha.getCardById(cardId);
    return GameCommonRules.getCardAdditionalNumberOfTargets(card, this);
  }

  public getEquipSkills<T extends Skill = Skill>(skillType?: SkillStringType) {
    const equipCards = this.playerCards[PlayerCardsArea.EquipArea].map(card => Sanguosha.getCardById(card));
    const skills = equipCards.map(card => card.Skill);
    if (skillType === undefined) {
      return skills as T[];
    }

    switch (skillType) {
      case 'filter':
        return skills.filter(skill => skill instanceof FilterSkill) as T[];
      case 'active':
        return skills.filter(skill => skill instanceof ActiveSkill) as T[];
      case 'viewAs':
        return skills.filter(skill => skill instanceof ViewAsSkill) as T[];
      case 'trigger':
        return skills.filter(skill => skill instanceof TriggerSkill) as T[];
      case 'breaker':
        return skills.filter(skill => skill instanceof RulesBreakerSkill) as T[];
      case 'complusory':
        return skills.filter(skill => skill.SkillType === SkillType.Compulsory) as T[];
      case 'awaken':
        return skills.filter(skill => skill.SkillType === SkillType.Awaken) as T[];
      case 'limit':
        return skills.filter(skill => skill.SkillType === SkillType.Limit) as T[];
      case 'common':
        return skills.filter(skill => skill.SkillType === SkillType.Common) as T[];
      case 'transform':
        return skills.filter(skill => skill instanceof TransformSkill) as T[];
      default:
        throw Precondition.UnreachableError(skillType);
    }
  }

  public getPlayerSkills<T extends Skill = Skill>(skillType?: SkillStringType): T[] {
    Precondition.assert(
      this.playerCharacter !== undefined,
      `Player ${this.playerName} has not been initialized with a character yet`,
    );

    if (skillType === undefined) {
      return this.playerSkills as T[];
    }

    switch (skillType) {
      case 'filter':
        return this.playerSkills.filter(skill => skill instanceof FilterSkill) as T[];
      case 'viewAs':
        return this.playerSkills.filter(skill => skill instanceof ViewAsSkill) as T[];
      case 'active':
        return this.playerSkills.filter(skill => skill instanceof ActiveSkill) as T[];
      case 'trigger':
        return this.playerSkills.filter(skill => skill instanceof TriggerSkill) as T[];
      case 'breaker':
        return this.playerSkills.filter(skill => skill instanceof RulesBreakerSkill) as T[];
      case 'transform':
        return this.playerSkills.filter(skill => skill instanceof TransformSkill) as T[];
      case 'complusory':
        return this.playerSkills.filter(skill => skill.SkillType === SkillType.Compulsory) as T[];
      case 'awaken':
        return this.playerSkills.filter(skill => skill.SkillType === SkillType.Awaken) as T[];
      case 'limit':
        return this.playerSkills.filter(skill => skill.SkillType === SkillType.Limit) as T[];
      case 'common':
        return this.playerSkills.filter(skill => skill.SkillType === SkillType.Common) as T[];
      default:
        throw Precondition.UnreachableError(skillType);
    }
  }

  public getSkills<T extends Skill = Skill>(skillType?: SkillStringType): T[] {
    return [...this.getEquipSkills<T>(skillType), ...this.getPlayerSkills<T>(skillType)];
  }

  public loseSkill(skillName: string) {
    this.playerSkills = this.playerSkills.filter(skill => !skill.Name.endsWith(skillName));
  }

  public obtainSkill(skillName: string) {
    this.playerSkills.push(Sanguosha.getSkillBySkillName(skillName));
    for (const shadowSkill of Sanguosha.getShadowSkillsBySkillName(skillName)) {
      this.playerSkills.push(shadowSkill);
    }
  }

  public turnOver() {
    this.turnedOver = !this.turnedOver;
  }

  public isFaceUp() {
    return !this.turnedOver;
  }

  public onDamage(hit: number) {
    this.hp -= hit;
  }

  public onLoseHp(lostHp: number) {
    this.hp -= lostHp;
  }

  public onRecoverHp(recover: number) {
    this.hp += recover;
  }

  public get Hp() {
    return this.hp;
  }

  public get Gender() {
    return this.gender;
  }

  public get ChainLocked() {
    return this.chainLocked;
  }
  public set ChainLocked(locked: boolean) {
    this.chainLocked = locked;
  }

  public get Nationality() {
    return Precondition.exists(this.nationality, 'Uninitialized nationality');
  }
  public set Nationality(nationality: CharacterNationality) {
    this.nationality = nationality;
  }

  public get MaxHp() {
    return this.maxHp;
  }
  public set MaxHp(maxHp: number) {
    this.maxHp = maxHp;
    if (this.hp > this.maxHp) {
      this.hp = this.maxHp;
    }
  }

  public get Role() {
    return this.playerRole;
  }
  public set Role(role: PlayerRole) {
    this.playerRole = role;
  }

  public set CharacterId(characterId: CharacterId | undefined) {
    if (characterId === undefined) {
      return;
    }

    if (this.playerCharacter !== undefined) {
      this.playerSkills = this.playerSkills.filter(skill => {
        if (this.playerCharacter!.Skills.includes(skill)) {
          skill.onLoseSkill(this);
          return false;
        }

        return true;
      });
    }

    this.playerCharacterId = characterId;
    this.playerCharacter = Sanguosha.getCharacterById(this.playerCharacterId);
    this.playerSkills = this.playerCharacter.Skills.filter(skill =>
      skill.isLordSkill() ? this.playerRole === PlayerRole.Lord : true,
    );

    this.hp = this.playerCharacter.MaxHp;
    this.maxHp = this.playerCharacter.MaxHp;
    this.nationality = this.playerCharacter.Nationality;
    this.gender = this.playerCharacter.Gender;
  }
  public get CharacterId(): CharacterId | undefined {
    return this.playerCharacterId;
  }

  public get Character(): Character {
    return Precondition.exists(this.playerCharacter, 'Uninitialized player character');
  }

  public get Id() {
    return this.playerId;
  }

  public get Name() {
    return this.playerName;
  }

  public get Position() {
    return this.playerPosition;
  }
  public set Position(position: number) {
    this.playerPosition = position;
  }

  public get CardUseHistory() {
    return this.cardUseHistory;
  }

  public get Dead() {
    return this.dead;
  }

  public bury() {
    this.dead = true;
  }

  public getPlayerInfo(): PlayerInfo {
    return {
      Id: this.playerId,
      Name: this.playerName,
      Position: this.playerPosition,
      CharacterId: this.playerCharacterId,
      Role: this.playerRole,
    };
  }

  public offline() {
    this.online = false;
  }

  public isOnline() {
    return this.online;
  }

  public get AI() {
    return this.ai;
  }
}
