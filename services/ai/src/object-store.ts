import { createHash, createHmac } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

@Injectable()
export class ObjectStore {
  private readonly endpoint = new URL(
    process.env.MINIO_ENDPOINT ?? "http://minio:9000",
  );
  private readonly accessKey = process.env.MINIO_ROOT_USER ?? "maknyak";
  private readonly secretKey =
    process.env.MINIO_ROOT_PASSWORD ?? "maknyak_local_secret";
  private readonly bucket =
    process.env.AGENT_ARTIFACT_BUCKET ?? "maknyak-agent-artifacts";
  private bucketReady: Promise<void> | undefined;

  async put(key: string, content: string): Promise<void> {
    await this.ensureBucket();
    await this.request(
      "PUT",
      `/${this.bucket}/${encodeKey(key)}`,
      content,
      "application/json",
    );
  }
  async get(key: string): Promise<string> {
    const response = await this.request(
      "GET",
      `/${this.bucket}/${encodeKey(key)}`,
      "",
    );
    return response.text();
  }
  async delete(key: string): Promise<void> {
    await this.request("DELETE", `/${this.bucket}/${encodeKey(key)}`, "");
  }
  private async ensureBucket() {
    this.bucketReady ??= this.request("PUT", `/${this.bucket}`, "")
      .then(() => undefined)
      .catch((error: unknown) => {
        this.bucketReady = undefined;
        throw error;
      });
    return this.bucketReady;
  }
  private async request(
    method: string,
    path: string,
    body: string,
    contentType?: string,
  ): Promise<Response> {
    const payloadHash = sha256(body);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const host = this.endpoint.host;
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((key) => `${key}:${headers[key]}\n`)
      .join("");
    const canonical = [
      method,
      path,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${date}/us-east-1/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join(
      "\n",
    );
    const dateKey = hmac(`AWS4${this.secretKey}`, date);
    const regionKey = hmac(dateKey, "us-east-1");
    const serviceKey = hmac(regionKey, "s3");
    const signingKey = hmac(serviceKey, "aws4_request");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, toSign).toString("hex")}`;
    const response = await fetch(new URL(path, this.endpoint), {
      method,
      headers,
      ...(method === "PUT" ? { body } : {}),
      signal: AbortSignal.timeout(5000),
    });
    if (
      !response.ok &&
      !(
        method === "PUT" &&
        path === `/${this.bucket}` &&
        response.status === 409
      )
    )
      throw new ServiceUnavailableException(
        `Object storage returned ${response.status}`,
      );
    return response;
  }
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}
function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}
