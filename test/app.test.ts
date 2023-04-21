import axios from "axios"
import { describe, expect, test, beforeAll, afterAll } from "@jest/globals"
import type { Server } from "http"
import type { AddressInfo } from "net"

import app from "../src/app"

describe("app tests", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    console.log('App listening on port', port);
    baseUrl = `http://localhost:${port}`
  });
  afterAll(() => {
    server.close()
  });
  test("/oauth/v1/token POST", async () => {
    const response = await axios({
      method: 'post',
      url: `${baseUrl}/oauth/v1/token`,
    })

    console.log(response)
    expect(response.status).toBe(200)
  })
})
