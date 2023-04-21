import { describe, expect, test } from "@jest/globals"
import request from "supertest"

import app from "../src/app"

describe("app tests", () => {
  test("/oauth/v1/token POST", async () => {
    const response = await request(app).post("/oauth/v1/token")
    expect(response.statusCode).toBe(200)
  })
})
