import axios from "axios"
import { describe, expect, test, beforeAll, afterAll, afterEach } from "@jest/globals"
import type { Server } from "http"
import type { AddressInfo } from "net"
import { Client } from "@hubspot/api-client"

import app from "./app"

describe("app tests", () => {
  let server: Server
  let baseUrl: string
  let hubspotClient: Client

  beforeAll(() => {
    server = app.listen(0)
    const port = (server.address() as AddressInfo).port
    console.log("App listening on port", port)
    baseUrl = `http://localhost:${port}`

    hubspotClient = new Client({
      accessToken: "accessToken",
      basePath: baseUrl,
    })
  })
  afterAll(() => {
    server.close()
  })

  afterEach(async () => {
    await axios({
      method: "get",
      url: `${baseUrl}/reset`,
    })
  })

  test("/oauth/v1/token POST", async () => {
    const response = await axios({
      method: "post",
      url: `${baseUrl}/oauth/v1/token`,
    })

    expect(response.status).toBe(200)
  })

  test("Get all companies when no present", async () => {
    const response = await hubspotClient.crm.companies.basicApi.getPage()
    expect(response.results).toStrictEqual([])
  })

  test("Get all companies when multiple present", async () => {
    const createResponse1 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 1",
      },
    })
    expect(createResponse1).toBeDefined()

    const createResponse2 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 2",
      },
    })
    expect(createResponse2).toBeDefined()

    const response = await hubspotClient.crm.companies.basicApi.getPage()
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
        name,
      },
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
    await expect(
      async () => await hubspotClient.crm.companies.basicApi.getById("42")
    ).rejects.toThrow()
  })

  test("Archiving company", async () => {
    const name = "Test company 1"

    const createResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name,
      },
    })
    expect(createResponse).toBeDefined()
    expect(createResponse.id).toBeDefined()
    expect(createResponse.properties.name).toBe(name)
    expect(createResponse.createdAt).toBeDefined()
    expect(createResponse.updatedAt).toBeDefined()
    expect(createResponse.archived).toBe(false)

    await hubspotClient.crm.companies.basicApi.archive(createResponse.id)

    const getResponse = await hubspotClient.crm.companies.basicApi.getById(createResponse.id, undefined, undefined, undefined, true)
    expect(getResponse).toBeDefined()
    expect(getResponse.id).toBeDefined()
    expect(getResponse.properties.name).toBe(name)
    expect(getResponse.createdAt).toBeDefined()
    expect(getResponse.updatedAt).toBeDefined()
    expect(getResponse.archived).toBe(true)

    // Check that archived company does not appear in list when non-archived are requested
    const response = await hubspotClient.crm.companies.basicApi.getPage()
    expect(response.results).toStrictEqual([])
  })

  test("Creating multiple companies assigns different ids to them", async () => {
    const createResponse1 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 1",
      },
    })
    const createResponse2 = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 2",
      },
    })
    expect(createResponse1.id).not.toBe(createResponse2.id)
  })

  test("Create company/contact association", async () => {
    const createCompanyResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: "Test company 1",
      },
    })
    const createContactResponse = await hubspotClient.crm.contacts.basicApi.create({
      properties: {
        firstname: "Teppo",
        lastname: "Testaaja",
        email: "teppo@testaaja.fi",
      },
    })

    const associationResponse = await hubspotClient.crm.contacts.associationsApi.create(
      parseInt(createContactResponse.id),
      "company",
      parseInt(createCompanyResponse.id),
      [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: 1,
        },
      ]
    )
    expect(associationResponse).toBeDefined()
    expect(associationResponse.fromObjectTypeId).toBe("contacts")
    expect(associationResponse.fromObjectId).toBe(parseInt(createContactResponse.id))
    expect(associationResponse.toObjectTypeId).toBe("company")
    expect(associationResponse.toObjectId).toBe(parseInt(createCompanyResponse.id))

    const getResponse = await hubspotClient.crm.contacts.associationsApi.getAll(
      parseInt(createContactResponse.id),
      "company"
    )
    expect(getResponse.results).toBeDefined()
    expect(getResponse.results).toHaveLength(1)
    const association = getResponse.results[0]
    expect(association.toObjectId).toBe(parseInt(createCompanyResponse.id))
    expect(association.associationTypes).toHaveLength(1)
    expect(association.associationTypes[0].category).toBe("HUBSPOT_DEFINED")
    expect(association.associationTypes[0].typeId).toBe(1)

    const getContactResponse = await hubspotClient.crm.contacts.basicApi.getById(
      createContactResponse.id,
      undefined,
      undefined,
      ["company"],
      undefined
    )
    expect(getContactResponse.associations).toBeDefined()
    expect(getContactResponse.associations?.companies).toBeDefined()
    expect(getContactResponse.associations?.companies?.results).toHaveLength(1)
    expect(getContactResponse.associations?.companies?.results[0].id).toBe(parseInt(createCompanyResponse.id))
  })

  test("Updating company", async () => {
    const name = "Test company 1"
    const extraData = "Some extra data"

    const createResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name,
      },
    })
    expect(createResponse).toBeDefined()
    expect(createResponse.id).toBeDefined()
    expect(createResponse.properties.name).toBe(name)
    expect(createResponse.createdAt).toBeDefined()
    expect(createResponse.updatedAt).toBeDefined()
    expect(createResponse.archived).toBe(false)

    const updateResponse = await hubspotClient.crm.companies.basicApi.update(createResponse.id, {
      properties: {
        extra_data: extraData,
      },
    })
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

  test("Search company without results", async () => {
    const filters = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              operator: "EQ",
              value: "Company name",
            },
          ],
        },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
    // @ts-ignore
    const response = await hubspotClient.crm.companies.searchApi.doSearch(filters)
    expect(response.total).toBe(0)
    expect(response.results).toStrictEqual([])
  })

  test("Search company with results", async () => {
    const name = "Test company 1"

    const createResponse = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name,
      },
    })
    expect(createResponse).toBeDefined()
    expect(createResponse.id).toBeDefined()

    const filters = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              operator: "EQ",
              value: name,
            },
          ],
        },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
    // @ts-ignore
    const response = await hubspotClient.crm.companies.searchApi.doSearch(filters)
    expect(response.total).toBe(1)
    expect(response.results).toHaveLength(1)
    expect(response.results[0].id).toBe(createResponse.id)
    expect(response.results[0].properties.name).toBe(name)
  })

  test("Form submission creates new contact", async () => {
    const data = {
      fields: [
          {
              name: "email",
              value: "teppo@tester.com",
          },
          {
              name: "firstname",
              value: "Teppo",
          },
          {
              name: "lastname",
              value: "the Tester",
          },
      ],
  };

  const response = await axios.post(
      `${baseUrl}/submissions/v3/integration/secure/submit/1234/5678`,
      data,
      {
          headers: {
              Authorization: "Bearer accessToken",
              "Content-Type": "application/json",
          },
      }
  );
  expect(response.status).toBe(200)

  const filters = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "email",
            operator: "EQ",
            value: "teppo@tester.com",
          },
        ],
      },
    ],
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
  // @ts-ignore
  const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch(filters)
  expect(searchResponse.total).toBe(1)
  expect(searchResponse.results).toHaveLength(1)
  expect(searchResponse.results[0].properties.email).toBe("teppo@tester.com")
  expect(searchResponse.results[0].properties.firstname).toBe("Teppo")
  expect(searchResponse.results[0].properties.lastname).toBe("the Tester")
})

test("Form submission updates existing contact", async () => {
  const createResponse = await hubspotClient.crm.contacts.basicApi.create({
    properties: {
      email: "teppo@tester.com",
      firstname: "Placeholder",
      lastname: "Placeholder",
    },
  })
  expect(createResponse).toBeDefined()
  expect(createResponse.id).toBeDefined()

  const data = {
    fields: [
        {
            name: "email",
            value: "teppo@tester.com",
        },
        {
            name: "firstname",
            value: "Teppo",
        },
        {
            name: "lastname",
            value: "the Tester",
        },
    ],
  };

  const response = await axios.post(
      `${baseUrl}/submissions/v3/integration/secure/submit/1234/5678`,
      data,
      {
          headers: {
              Authorization: "Bearer accessToken",
              "Content-Type": "application/json",
          },
      }
  );
  expect(response.status).toBe(200)

  const getResponse = await hubspotClient.crm.contacts.basicApi.getById(createResponse.id)
  expect(getResponse).toBeDefined()
  expect(getResponse.id).toBeDefined()
  expect(getResponse.properties.firstname).toBe("Teppo")
  expect(getResponse.properties.lastname).toBe("the Tester")
})

  /*
  test("Real hubspot", async () => {
    const realClient = new Client({ accessToken: process.env.HUBSPOT_API_KEY });
    const getResponse = await realClient.crm.companies.basicApi.getPage()
    console.log(getResponse)
  })
*/
})
