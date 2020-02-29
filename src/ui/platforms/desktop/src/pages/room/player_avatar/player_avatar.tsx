import classNames from 'classnames';
import { getNationalityRawText } from 'core/characters/character';
import { Player } from 'core/player/player';
import { Translation } from 'core/translations/translation_json_tool';
import * as mobx from 'mobx';
import * as mobxReact from 'mobx-react';
import * as React from 'react';
import { RoomPresenter, RoomStore } from '../room.presenter';
import styles from './player_avatar.module.css';

type PlayerAvatarProps = {
  store: RoomStore;
  presenter: RoomPresenter;
  translator: Translation;
  updateFlag: boolean;
  disabled?: boolean;
  onClick?(player: Player, selected: boolean): void;
};

@mobxReact.observer
export class PlayerAvatar extends React.Component<PlayerAvatarProps> {
  @mobx.observable.ref
  selected: boolean = false;

  private readonly onClick = mobx.action(() => {
    if (this.props.disabled === false) {
      this.selected = !this.selected;
      this.props.onClick && this.props.onClick(this.props.presenter.ClientPlayer!, this.selected);
    }
  });

  @mobx.action
  componentDidUpdate() {
    if (!!this.props.disabled) {
      this.selected = false;
    }
  }

  render() {
    const clientPlayer = this.props.presenter.ClientPlayer;
    const character = clientPlayer?.CharacterId
      ? clientPlayer?.Character
      : undefined;

    return (
      <div
        className={classNames(styles.playerCard, {
          [styles.selected]: this.selected && !this.props.disabled,
        })}
        onClick={this.onClick}
      >
        <p>{clientPlayer?.Name}</p>
        {character && (
          <div className={styles.playerCardInside}>
            <span className={styles.nationality}>
              {this.props.translator.tr(
                getNationalityRawText(character.Nationality),
              )}
            </span>
            <span>{this.props.translator.tr(character.Name)}</span>
            <span>
              {clientPlayer?.Hp}/{clientPlayer?.MaxHp}
            </span>
          </div>
        )}
      </div>
    );
  }
}
