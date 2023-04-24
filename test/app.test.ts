import axios from "axios"
import { describe, expect, test, beforeAll, afterAll, afterEach } from "@jest/globals"
import type { Server } from "http"
import type { AddressInfo } from "net"
import { Client } from "@hubspot/api-client";

import app from "../src/app"

describe("app tests", () => {
  let server: Server;
  let baseUrl: string;
  let hubspotClient: Client;

  beforeAll(() => {
    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    console.log('App listening on port', port);
    baseUrl = `http://localhost:${port}`

    hubspotClient = new Client({
      accessToken: 'accessToken',
      basePath: baseUrl,
    });
  })
  afterAll(() => {
    server.close()
  })

  afterEach(async () => {
    await axios({
      method: 'get',
      url: `${baseUrl}/reset`,
    })
  })

  test("/oauth/v1/token POST", async () => {
    const response = await axios({
      method: 'post',
      url: `${baseUrl}/oauth/v1/token`,
    })

    expect(response.status).toBe(200)
  })

  test("Get all companies when no present", async () => {
    const response = await hubspotClient.crm.companies.basicApi.getPage();
    expect(response.results).toStrictEqual([])
  })

  test("Get all companies when multiple present", async () => {
    const createResponse1 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 1"
      }
    })
    expect(createResponse1).toBeDefined()

    const createResponse2 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 2"
      }
    })
    expect(createResponse2).toBeDefined()

    const response = await hubspotClient.crm.companies.basicApi.getPage();
    expect(response).toBeDefined()
    expect(response.results).toHaveLength(2)

    expect(response.results[0].id).toBe(createResponse1.id)
    expect(response.results[0].properties).toStrictEqual(createResponse1.properties)

    expect(response.results[1].id).toBe(createResponse2.id)
    expect(response.results[1].properties).toStrictEqual(createResponse2.properties)
  })

  test("Creating and reading company", async () => {
    const name = "Test company 1"

    const createResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name
      }
    })
    expect(createResponse).toBeDefined()
    expect(createResponse.id).toBeDefined()
    expect(createResponse.properties.name).toBe(name)
    expect(createResponse.createdAt).toBeDefined()
    expect(createResponse.updatedAt).toBeDefined()
    expect(createResponse.archived).toBe(false)

    const getResponse = await hubspotClient.crm.companies.basicApi.getById(createResponse.id)
    expect(getResponse).toBeDefined()
    expect(getResponse.id).toBeDefined()
    expect(getResponse.properties.name).toBe(name)
    expect(getResponse.createdAt).toBeDefined()
    expect(getResponse.updatedAt).toBeDefined()
    expect(getResponse.archived).toBe(false)
  })

  test("Reading company not present", async () => {
    await expect(async () => await hubspotClient.crm.companies.basicApi.getById("42")).rejects.toThrow()
  })

  test("Creating multiple companies assigns different ids to them", async () => {
    const createResponse1 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 1"
      }
    })
    const createResponse2 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 2"
      }
    })
    expect(createResponse1.id).not.toBe(createResponse2.id)
  });

  test("Create company/contact association", async () => {
    const createCompanyResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 1"
      }
    })
    const createContactResponse = await hubspotClient.crm.contacts.basicApi.create({
      properties: {
        firstname: "Teppo",
        lastname: "Testaaja",
        email: "teppo@testaaja.fi",
      }
    })

    const associationResponse = await hubspotClient.crm.contacts.associationsApi.create(
      parseInt(createContactResponse.id),
      "company",
      parseInt(createCompanyResponse.id),
      [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: 1,
        }
      ]
    )
    expect(associationResponse).toBeDefined()
    expect(associationResponse.fromObjectTypeId).toBe("contacts")
    expect(associationResponse.fromObjectId).toBe(createContactResponse.id)
    expect(associationResponse.toObjectTypeId).toBe("company")
    expect(associationResponse.toObjectId).toBe(createCompanyResponse.id)

    const getResponse = await hubspotClient.crm.contacts.associationsApi.getAll(parseInt(createContactResponse.id), "company")
    expect(getResponse.results).toBeDefined()
    expect(getResponse.results).toHaveLength(1)
    const association = getResponse.results[0]
    expect(association.toObjectId).toBe(createCompanyResponse.id)
    expect(association.associationTypes).toHaveLength(1)
    expect(association.associationTypes[0].category).toBe("HUBSPOT_DEFINED")
    expect(association.associationTypes[0].typeId).toBe(1)
  });

  test("Updating company", async () => {
    const name = "Test company 1"
    const extraData = "Some extra data"

    const createResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name
      }
    })
    expect(createResponse).toBeDefined()
    expect(createResponse.id).toBeDefined()
    expect(createResponse.properties.name).toBe(name)
    expect(createResponse.createdAt).toBeDefined()
    expect(createResponse.updatedAt).toBeDefined()
    expect(createResponse.archived).toBe(false)

    const updateResponse = await hubspotClient.crm.companies.basicApi.update(
      createResponse.id,
      {
        properties: {
          extra_data: extraData,
        },
      }
    )
    expect(updateResponse.properties.name).toBe(name)
    expect(updateResponse.properties.extra_data).toBe(extraData)

    const getResponse = await hubspotClient.crm.companies.basicApi.getById(createResponse.id)
    expect(getResponse).toBeDefined()
    expect(getResponse.id).toBeDefined()
    expect(getResponse.properties.name).toBe(name)
    expect(getResponse.properties.extra_data).toBe(extraData)
    expect(getResponse.createdAt).toBeDefined()
    expect(getResponse.updatedAt).toBeDefined()
    expect(getResponse.archived).toBe(false)
  })
/*
  test("Real hubspot", async () => {
    const realClient = new Client({ accessToken: process.env.HUBSPOT_API_KEY });
    const getResponse = await realClient.crm.companies.basicApi.getPage()
    console.log(getResponse)
  })
*/
})
