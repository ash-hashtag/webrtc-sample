type CallEvent = "localStream" | "remoteStream" | "connectionState";

export class CallSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isMicEnabled = true;
  private isVideoEnabled = true;
  private currentCamera: string | null = null;
  private eventListeners: Map<CallEvent, Function[]> = new Map();

  private username: string;
  private remoteUser: string;

  sendCallMessage: (data: string) => Promise<void>;

  constructor(
    username: string,
    remoteUser: string,
    sendCallMessage: (data: string) => Promise<void>,
  ) {
    this.username = username;
    this.remoteUser = remoteUser;
    this.sendCallMessage = sendCallMessage;
  }

  private _sendCallMessage(payload: any) {
    payload["from"] = this.username;
    const data = JSON.stringify(payload);
    this.sendCallMessage(data);
  }

  async init() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.pc.onconnectionstatechange = () => {
      this.emit("connectionState", this.pc!.connectionState);
      if (
        this.pc!.connectionState === "failed" ||
        this.pc!.connectionState === "disconnected"
      ) {
        // this.silentReconnect();
        this.reconnect();
      }
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendCallMessage({
          type: "candidate",
          candidate: e.candidate,
        });
      }
    };

    this.pc.ontrack = (e) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      this.remoteStream.addTrack(e.track);
      this.emit("remoteStream", this.remoteStream);
    };

    if (!this.localStream) {
      await this.setupLocalMedia();
    } else {
      this.localStream
        .getTracks()
        .forEach((track) => this.pc?.addTrack(track, this.localStream!));
    }

    // this.listenSignaling();
  }

  private async setupLocalMedia() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: this.isVideoEnabled,
      audio: this.isMicEnabled,
    });

    this.emit("localStream", this.localStream);

    this.localStream
      .getTracks()
      .forEach((track) => this.pc?.addTrack(track, this.localStream!));
  }

  async onCallMessage(data: string) {
    const msg = JSON.parse(data);

    if (msg.from !== this.remoteUser) return;

    switch (msg.type) {
      case "offer":
        await this.pc!.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this._sendCallMessage({ type: "answer", sdp: answer });
        break;

      case "answer":
        await this.pc!.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;

      case "candidate":
        await this.pc?.addIceCandidate(msg.candidate);
        break;
    }
  }

  // private listenSignaling() {
  //   onCallMessage(async (msg) => {
  //     if (msg.from !== this.remoteUser) return;

  //     switch (msg.type) {
  //       case "offer":
  //         await this.pc!.setRemoteDescription(
  //           new RTCSessionDescription(msg.sdp),
  //         );
  //         const answer = await this.pc!.createAnswer();
  //         await this.pc!.setLocalDescription(answer);
  //         sendCallMessage(this.remoteUser, { type: "answer", sdp: answer });
  //         break;

  //       case "answer":
  //         await this.pc!.setRemoteDescription(
  //           new RTCSessionDescription(msg.sdp),
  //         );
  //         break;

  //       case "candidate":
  //         await this.pc?.addIceCandidate(msg.candidate);
  //         break;
  //     }
  //   });
  // }

  async startCall() {
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this._sendCallMessage({ type: "offer", sdp: offer });
  }

  toggleMic(enable: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enable));
    this.isMicEnabled = enable;
  }

  toggleVideo(enable: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enable));
    this.isVideoEnabled = enable;
  }

  async flipCamera() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === "videoinput");
    if (cameras.length < 2) return;

    const currentIndex = cameras.findIndex(
      (c) => c.deviceId === this.currentCamera,
    );
    const next = cameras[(currentIndex + 1) % cameras.length];
    this.currentCamera = next.deviceId;

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: next.deviceId },
      audio: this.isMicEnabled,
    });

    const newTrack = newStream.getVideoTracks()[0];
    this.pc
      ?.getSenders()
      .find((s) => s.track?.kind === "video")
      ?.replaceTrack(newTrack);

    this.localStream = newStream;
    this.emit("localStream", this.localStream);
  }

  private async reconnect() {
    const oldStream = this.localStream;
    await this.leave(false); // keep local stream alive
    await this.init(); // recreate RTCPeerConnection
    await this.startCall(); // resend offer

    if (oldStream) this.emit("localStream", oldStream);
  }

  async leave(stopMedia = true) {
    this.pc?.close();
    this.pc = null;
    if (stopMedia) {
      this.localStream?.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
  }

  on(event: CallEvent, callback: Function) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event)!.push(callback);
  }

  private emit(event: CallEvent, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) listeners.forEach((cb) => cb(data));
  }
}

export class Foo {}
