import { CallSession } from "./call-session";

const baseOrigin = "192.168.1.20:8443";

const startSession = async (session: CallSession) => {
  const ws = new WebSocket(`wss://${baseOrigin}`);
  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", (ev) => {
    session?.onCallMessage(ev.data);
  });

  ws.addEventListener("close", (_) => {
    setTimeout(() => {
      startSession(session);
    }, 1000);
  });
};
document.querySelector("#startBtn")!.addEventListener("click", async (_) => {
  const username = (document.querySelector("#myUsername") as HTMLInputElement)
    .value;
  const otherUsername = (
    document.querySelector("#otherUsername") as HTMLInputElement
  ).value;
  console.log(`Starting session ${username} -> ${otherUsername}`);
  const session = new CallSession(username, otherUsername, async (data) => {
    await fetch(`https://${baseOrigin}/send`, {
      method: "POST",
      body: data,
    });
  });

  session.on("connectionState", (state) => {
    console.log({ state });
  });

  session.on("localStream", (stream) => {
    if (stream == null) {
      return;
    }

    (document.querySelector("#localStream") as HTMLVideoElement).srcObject =
      stream as MediaSource;
  });

  session.on("remoteStream", (stream) => {
    if (stream == null) {
      return;
    }

    (document.querySelector("#remoteStream") as HTMLVideoElement).srcObject =
      stream as MediaSource;
  });

  await session.init();
  startSession(session);
  document.querySelector("#startCallBtn")!.addEventListener("click", (_) => {
    session.startCall();
  });
});
