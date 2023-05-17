import axios from "axios"
import bodyParser from "body-parser"
import express from "express"
import type { Express, Request } from "express"
import moment from "moment"
import morgan from "morgan"
import pluralize from "pluralize"

import config from "./config"

interface AssociationType {
  readonly associationCategory: string
  readonly associationTypeId: number
}

class Association {
  readonly toObjectId: number
  readonly associationTypes: AssociationType[]

  constructor(toObjectId: number, associationTypes: AssociationType[]) {
    this.toObjectId = toObjectId
    this.associationTypes = associationTypes
  }
}

interface Filter {
  readonly propertyName: string
  readonly operator: string
  readonly value: string
}

interface FilterGroup {
  readonly filters: Filter[]
}

interface Filters {
  readonly filterGroups: FilterGroup[]
}

const app: Express = express()

app.use(morgan("combined"))
app.use(bodyParser.json())

const webhook = {
  send: async (events: any[]) => {
    if (config.webhook.url !== undefined) {
      events = events.map((ev) => {
        return {
          ...ev,
          appId: config.custom.app_id,
        }
      })
      await axios({
        method: "post",
        url: config.webhook.url,
        data: events,
      })
    }
  },
}

const data = {
  contacts: {
    list: [] as number[],
    set: new Map<number, any>(),
  },
  companies: {
    list: [] as number[],
    set: new Map<number, any>(),
  },
  deals: {
    list: [] as number[],
    set: new Map<number, any>(),
  },
  tickets: {
    list: [] as number[],
    set: new Map<number, any>(),
  },
}

type DataKey = keyof typeof data

const newIds = {
  contacts: 10000000,
  companies: 10000000,
  deals: 10000000,
  tickets: 10000000,
}

type KeyKey = keyof typeof newIds

const newId = (resourceName: string): number => {
  return newIds[resourceName as KeyKey]++
}

const getResourceName = (resources: string): string => {
  switch (resources) {
    case "companies":
      return "company"
    case "contacts":
      return "contact"
    case "deals":
      return "deal"
    case "tickets":
      return "ticket"
  }
  throw new Error("NotImplemented")
}

app.get(
  "/crm/v3/objects/:resource",
  async (
    req: Request<
      { resource: string },
      unknown,
      unknown,
      { archived?: boolean }
    >,
    res
  ) => {
    const archived = req.query.archived ?? false
    const resource = data[req.params.resource as DataKey]
    const list = [...resource.set.values()]
    const response = {
      results: list.filter(item => !!(item.archived as boolean) === !!archived),
    }

    res.type("json")
    res.status(200)
    res.send(response)
  }
)

app.post("/crm/v3/objects/:resource", async (req, res) => {
  const id = newId(req.params.resource)
  res.type("json")
  const ts = moment().format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z"
  const resource = {
    id: id.toString(),
    createdAt: ts,
    updatedAt: ts,
    archived: false,
    ...req.body,
  }
  data[req.params.resource as DataKey].set.set(id, resource)
  data[req.params.resource as DataKey].list.push(id)
  await webhook.send([
    {
      portalId: config.custom.customer_id,
      subscriptionType: `${req.params.resource}.creation`,
      objectId: id,
    },
  ])
  res.status(201)
  res.send(resource)
})

app.get(
  "/crm/v3/objects/:resource/:resource_id",
  async (
    req: Request<
      { resource: string; resource_id: string },
      unknown,
      unknown,
      { associations?: string; archived?: boolean }
    >,
    res
  ) => {
    const associations = req.query.associations
    const archived = req.query.archived ?? false
    if (!data[req.params.resource as DataKey].set.has(parseInt(req.params.resource_id))) {
      res.type("html")
      res.status(404)
      res.send()
    } else {
      const result = data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id))
      // https://stackoverflow.com/a/68818811
      if (!!(result.archived as boolean) !== !!archived) {
        res.type("html")
        res.status(404)
        res.send()
        return
      }
      if (associations !== undefined) {
        for (const association of associations.split(",")) {
          const related: Association[] = result[pluralize(association)] ?? []
          if (related.length > 0) {
            if (result.associations === undefined) {
              result.associations = {}
            }
            result.associations[pluralize(association)] = {
              results: related.map((item) => {
                return {
                  id: item.toObjectId,
                  type: item.associationTypes[0].associationCategory,
                }
              }),
            }
          }
        }
      }

      res.type("json")
      res.status(200)
      res.send(result)
    }
  }
)

app.patch("/crm/v3/objects/:resource/:resource_id", async (req, res) => {
  const resourceName = getResourceName(req.params.resource)
  const before = data[req.params.resource as DataKey].set.get(
    parseInt(req.params.resource_id)
  ).properties
  const after = { ...before }
  Object.keys(req.body.properties).forEach((prop) => {
    after[prop] = req.body.properties[prop]
  })
  data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id)).properties = after
  const notifications: any[] = []
  Object.keys(after).forEach((prop) => {
    if (after[prop] !== before[prop]) {
      notifications.push({
        portalId: config.custom.customer_id,
        subscriptionType: `${resourceName}.propertyChange`,
        objectId: parseInt(req.params.resource_id),
        propertyName: prop,
      })
    }
  })
  await webhook.send(notifications)
  res.type("json")
  res.status(200)
  res.send(data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id)))
})

app.delete("/crm/v3/objects/:resource/:resource_id", async (req, res) => {
  data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id)).archived = true

  res.status(204)
  res.send()
})

app.get("/crm/v4/objects/:resource/:resource_id/associations/:to_object_type", async (req, res) => {
  const related: Association[] =
    data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id))[
      pluralize(req.params.to_object_type)
    ] ?? []
  const results = related.map((elem) => {
    return {
      toObjectId: elem.toObjectId,
      associationTypes: elem.associationTypes.map((associationType) => {
        return {
          category: associationType.associationCategory,
          typeId: associationType.associationTypeId,
        }
      }),
    }
  })
  res.type("json")
  res.status(200)
  res.send({
    results,
  })
})

app.put(
  "/crm/v4/objects/:resource/:resource_id/associations/:to_object_type/:object_id",
  async (req, res) => {
    const associationSpecs = req.body
    const entity = data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id))
    const key = pluralize(req.params.to_object_type)
    if (entity[key] === undefined) {
      entity[key] = []
    }
    entity[key].push(new Association(parseInt(req.params.object_id), associationSpecs))
    data[req.params.resource as DataKey].set.set(parseInt(req.params.resource_id), entity)

    res.type("json")
    res.status(201)
    res.send({
      fromObjectTypeId: req.params.resource,
      fromObjectId: parseInt(req.params.resource_id),
      toObjectTypeId: req.params.to_object_type,
      toObjectId: parseInt(req.params.object_id),
      labels: [],
    })
  }
)

app.post("/crm/v3/objects/:resource/search", async (req, res) => {
  const filters = req.body as Filters

  const results: object[] = []

  const entities = data[req.params.resource as DataKey].set.values()
  for (const entity of entities) {
    let add = false
    for (const filterGroup of filters.filterGroups) {
      let group = true
      for (const filter of filterGroup.filters) {
        if (filter.operator === "EQ") {
          if (entity.properties[filter.propertyName] !== filter.value) {
            group = false
          }
        }
      }
      add = add || group
    }
    if (add) {
      results.push(entity)
    }
  }

  res.type("json")
  res.status(200)
  res.send({
    total: results.length,
    results,
    paging: [],
  })
})

app.post("/oauth/v1/token", (req, res) => {
  res.type("json")
  res.status(200)
  res.send({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 999999,
    message: null,
    user: config.custom.customer_id,
  })
})

app.get(
  "/oauth/authorize",
  (req: Request<unknown, unknown, unknown, { redirect_uri: string }>, res) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { redirect_uri } = req.query
    const redirectTo = new URL(redirect_uri)
    redirectTo.searchParams.append("code", "code-to-exchange")
    console.log(`> redirecting to ${redirect_uri}`)
    res.redirect(redirectTo.toString())
  }
)

app.get("/oauth/v1/access-tokens/:token", (req, res) => {
  res.type("json")
  res.status(200)
  res.send({
    hub_id: config.custom.customer_id,
    token: "ReplaceWithToken",
    hub_domain: "ReplaceWithHubDomainHere",
    app_id: config.custom.app_id,
    expires_in: 999999,
    user_id: config.custom.customer_id,
    token_type: "token type",
  })
})

app.get("/ping", (req, res) => {
  res.status(200)
  res.send("pong")
})

app.get("/reset", (req, res) => {
  data.contacts.list.length = 0
  data.contacts.set.clear()
  data.companies.list.length = 0
  data.companies.set.clear()
  data.deals.list.length = 0
  data.deals.set.clear()
  data.tickets.list.length = 0
  data.tickets.set.clear()

  res.status(200)
  res.send()
})

export default app
