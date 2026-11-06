import "server-only";
import net from "node:net";

export type ScanResult = "CLEAN" | "INFECTED" | "SKIPPED";

/**
 * Virus scan through clamd's INSTREAM protocol (GEN-02).
 * When CLAMAV_HOST isn't configured (local dev) the scan is SKIPPED and recorded as such.
 */
export async function scanBuffer(data: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return "SKIPPED";
  const port = Number(process.env.CLAMAV_PORT || 3310);

  return new Promise<ScanResult>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let reply = "";
    socket.setTimeout(30_000, () => socket.destroy(new Error("ClamAV timeout")));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const CHUNK = 64 * 1024;
      for (let i = 0; i < data.length; i += CHUNK) {
        const chunk = data.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        socket.write(len);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
    });
    socket.on("data", (d) => (reply += d.toString()));
    socket.on("end", () => resolve(/FOUND/.test(reply) ? "INFECTED" : "CLEAN"));
    socket.on("error", reject);
  });
}
