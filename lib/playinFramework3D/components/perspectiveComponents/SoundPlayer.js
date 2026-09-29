import _ from "lodash-es";
import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import * as THREE from "three";

export class SoundPlayer extends BasePerspectiveComponent {
  constructor(props) {
    super(props);

    this.soundFxVolumeManagerComponent = null;

    this.initialized = false;

    this.audioMap = null;
  }

  render() {
    if (!this.initialized) {
      this.init();
    } else {
      this.updateSounds();
    }
  }

  init() {
    if (this.initialized) {
      return;
    }

    this.soundFxVolumeManagerComponent = this.helper.components.get(this.soundFxVolumeManagerId);

    this.initialized = true;

    this.audioMap = new Map();

    for (const audioKey in this.selectedSounds) {
      const newSound = new THREE.Audio(this.audioListener);
      // Buffers are stored under the asset key, not the slot name.
      const audioAbsoluteKey = _.get(this, `selectedSounds.${audioKey}[0].key`);
      const audioBuffer = this.loadedSoundBuffersInGameMap.get(audioAbsoluteKey);
      if (!_.isNil(audioBuffer)) {
        this.audioBuffer = audioBuffer;
        newSound.setBuffer(this.audioBuffer);
        newSound.soundKey = audioAbsoluteKey;
      } else {
        const audioBufferArray = this.loadedSoundArrayBuffersInGameMap.get(audioAbsoluteKey);
        this.audioListener.context.decodeAudioData(audioBufferArray.slice(0), (audioBuffer) => {
          this.loadedSoundBuffersInGameMap.set(audioAbsoluteKey, audioBuffer);
          newSound.setBuffer(audioBuffer);
          newSound.soundKey = audioAbsoluteKey;
        });
      }
      newSound.setLoop(false);
      this.audioMap.set(audioKey, newSound);
    }
  }

  updateSounds() {
    for (const audioKey in this.selectedSounds) {
      const absoluteAudioKey = _.get(this, `selectedSounds.${audioKey}[0].key`);
      const audio = this.audioMap.get(audioKey);
      if (audio.soundKey !== absoluteAudioKey) {
        let soundBuffer = this.loadedSoundBuffersInGameMap.get(absoluteAudioKey);
        if (!_.isNil(soundBuffer)) {
          audio.setBuffer(soundBuffer);
          audio.soundKey = absoluteAudioKey;
        } else {
          this.audioListener.context.decodeAudioData(
            this.loadedSoundArrayBuffersInGameMap.get(absoluteAudioKey).slice(0),
            (audioBuffer) => {
              this.loadedSoundBuffersInGameMap.set(absoluteAudioKey, audioBuffer);
              audio.setBuffer(audioBuffer);
              audio.soundKey = absoluteAudioKey;
            }
          );
        }
      }
    }
  }

  playSound(audioKey, isLoop = false, onComplete = null) {
    if (_.isNil(this.audioMap)) {
      console.error("AudioMap is not initialized !");
      return;
    }

    if (this.options.isSoundEnabled) {
      const audio = this.audioMap.get(audioKey);
      audio.setLoop(isLoop);
      audio.setVolume(this.soundFxVolumeManagerComponent.volume);
      if (audio.isPlaying) {
        audio.stop();
      }
      audio.play();
    }
  }

  stopSound(audioKey) {
    const audio = this.audioMap.get(audioKey);
    if (audio && audio.isPlaying) {
      audio.stop();
    }
  }

  getCurrentTime(audioKey) {
    const audio = this.audioMap.get(audioKey);
    if (!audio || !audio.isPlaying) {
      return -1;
    }

    const currentTime = audio.context.currentTime - audio._startedAt;
    const duration = audio.source.buffer.duration;

    const normalizedTime = currentTime / duration;
    return normalizedTime;
  }
}
