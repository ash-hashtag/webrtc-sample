(() => {
  // src/call-session.ts
  var CallSession = class {
    pc = null;
    localStream = null;
    remoteStream = null;
    isMicEnabled = true;
    isVideoEnabled = true;
    currentCamera = null;
    eventListeners = /* @__PURE__ */ new Map();
    username;
    remoteUser;
    sendCallMessage;
    constructor(username, remoteUser, sendCallMessage) {
      this.username = username;
      this.remoteUser = remoteUser;
      this.sendCallMessage = sendCallMessage;
    }
    _sendCallMessage(payload) {
      payload["from"] = this.username;
      const data = JSON.stringify(payload);
      this.sendCallMessage(data);
    }
    async init() {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      this.pc.onconnectionstatechange = () => {
        this.emit("connectionState", this.pc.connectionState);
        if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
          this.reconnect();
        }
      };
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this._sendCallMessage({
            type: "candidate",
            candidate: e.candidate
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
        this.localStream.getTracks().forEach((track) => this.pc?.addTrack(track, this.localStream));
      }
    }
    async setupLocalMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: this.isVideoEnabled,
        audio: this.isMicEnabled
      });
      this.emit("localStream", this.localStream);
      this.localStream.getTracks().forEach((track) => this.pc?.addTrack(track, this.localStream));
    }
    async onCallMessage(data) {
      const msg = JSON.parse(data);
      if (msg.from !== this.remoteUser) return;
      switch (msg.type) {
        case "offer":
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this._sendCallMessage({ type: "answer", sdp: answer });
          break;
        case "answer":
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
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
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this._sendCallMessage({ type: "offer", sdp: offer });
    }
    toggleMic(enable) {
      this.localStream?.getAudioTracks().forEach((t) => t.enabled = enable);
      this.isMicEnabled = enable;
    }
    toggleVideo(enable) {
      this.localStream?.getVideoTracks().forEach((t) => t.enabled = enable);
      this.isVideoEnabled = enable;
    }
    async flipCamera() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");
      if (cameras.length < 2) return;
      const currentIndex = cameras.findIndex(
        (c) => c.deviceId === this.currentCamera
      );
      const next = cameras[(currentIndex + 1) % cameras.length];
      this.currentCamera = next.deviceId;
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: next.deviceId },
        audio: this.isMicEnabled
      });
      const newTrack = newStream.getVideoTracks()[0];
      this.pc?.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(newTrack);
      this.localStream = newStream;
      this.emit("localStream", this.localStream);
    }
    async reconnect() {
      const oldStream = this.localStream;
      await this.leave(false);
      await this.init();
      await this.startCall();
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
    on(event, callback) {
      if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
      this.eventListeners.get(event).push(callback);
    }
    emit(event, data) {
      const listeners = this.eventListeners.get(event);
      if (listeners) listeners.forEach((cb) => cb(data));
    }
  };

  // src/index.ts
  var baseOrigin = "192.168.1.20:8443";
  var startSession = async (session) => {
    const ws = new WebSocket(`wss://${baseOrigin}`);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", (ev) => {
      session?.onCallMessage(ev.data);
    });
    ws.addEventListener("close", (_) => {
      setTimeout(() => {
        startSession(session);
      }, 1e3);
    });
  };
  document.querySelector("#startBtn").addEventListener("click", async (_) => {
    const username = document.querySelector("#myUsername").value;
    const otherUsername = document.querySelector("#otherUsername").value;
    console.log(`Starting session ${username} -> ${otherUsername}`);
    const session = new CallSession(username, otherUsername, async (data) => {
      await fetch(`https://${baseOrigin}/send`, {
        method: "POST",
        body: data
      });
    });
    session.on("connectionState", (state) => {
      console.log({ state });
    });
    session.on("localStream", (stream) => {
      if (stream == null) {
        return;
      }
      document.querySelector("#localStream").srcObject = stream;
    });
    session.on("remoteStream", (stream) => {
      if (stream == null) {
        return;
      }
      document.querySelector("#remoteStream").srcObject = stream;
    });
    await session.init();
    startSession(session);
    document.querySelector("#startCallBtn").addEventListener("click", (_2) => {
      session.startCall();
    });
  });
})();
