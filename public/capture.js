class EscapementCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
    this.port.onmessage = ({data}) => { if (data === 'stop') this.stopped = true; };
  }
  process(inputs) {
    if (this.stopped) return false;
    const channel = inputs[0]?.[0];
    if (!channel) { this.offset = 0; return true; }
    for (let i = 0; i < channel.length; i++) {
      if (this.offset === 0) this.frame = currentFrame + i;
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.buffer.length) {
        this.port.postMessage({frame:this.frame,data:this.buffer}, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('escapement-capture', EscapementCapture);

