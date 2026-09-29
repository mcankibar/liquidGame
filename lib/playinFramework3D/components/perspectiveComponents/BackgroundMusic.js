import _ from "lodash-es";
import { BaseComponent } from "../baseComponent";
import * as THREE from "three";
import { EventBus } from "../../modules/EventBus";
import { AUDIO_CONTEXT_RESUMED_EVENT } from "../../modules/EventNames";

export class BackgroundMusic extends BaseComponent {
  constructor(props) {
    super(props);
    super.update(props);

    this.eventBus = new EventBus();
    this.eventBus.on(AUDIO_CONTEXT_RESUMED_EVENT, () => {
      const key = this.selectedSounds.background[0].key;
      const audioBuffer = this.loadedSoundBuffersInGameMap.get(key);
      if (!_.isNil(audioBuffer)) {
        this.handleSound();
      } else {
        this.audioListener.context.decodeAudioData(
          this.loadedSoundArrayBuffersInGameMap.get(key).slice(0),
          (audioBuffer) => {
            this.loadedSoundBuffersInGameMap.set(key, audioBuffer);
            this.handleSound();
          }
        );
      }
    });
  }
  render() {
    super.render();
    if (
      THREE.AudioContext.getContext().state === "running" &&
      !_.isNil(this.loadedSoundBuffersInGameMap.get(this.selectedSounds.background[0].key))
    ) {
      this.handleSound();
    }
  }

  handleSound() {
    const soundKey = this.selectedSounds.background[0].key;
    const audioBuffer = this.loadedSoundBuffersInGameMap.get(soundKey);
    if (_.isNil(this.soundObject)) {
      this.soundObject = new THREE.Audio(this.audioListener);
      this.soundObject.setBuffer(audioBuffer);
      this.soundObject.setLoop(true);
      this.soundObject.soundKey = soundKey;
    } else {
      if (this.soundObject.soundKey !== soundKey) {
        this.soundObject.soundKey = soundKey;
        this.soundObject.stop();
        this.soundObject.setBuffer(audioBuffer);
        this.soundObject.play();
      }
    }
    this.soundObject.setVolume(this.volume);
    if (this.options.isSoundEnabled) {
      if (!this.soundObject.isPlaying && this.volume > 0) {
        this.soundObject.play();
      }
    } else {
      if (this.soundObject.isPlaying) {
        this.soundObject.stop();
      }
    }
  }
}
