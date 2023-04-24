import axios from "axios"
import bodyParser from "body-parser"
import express from "express"
import type { Express, Request } from "express"
import moment from "moment"
import pluralize from "pluralize"

import config from "./config"

const app: Express = express()

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

const newId = (resourceName: string): number => {
  const list = data[resourceName as DataKey].list
  return list.length !== 0 ? list[list.length - 1] + 1 : 1
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

app.get("/crm/v3/objects/:resource", async (req, res) => {
  const resource = data[req.params.resource as DataKey]
  const response = {
    results: [...resource.set.values()],
  };

  res.type("json")
  res.status(200)
  res.send(response)
});

app.post("/crm/v3/objects/:resource", async (req, res) => {
  const id = newId(req.params.resource)
  res.type("json")
  const ts = moment().format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z"
  const resource = {
    id,
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

app.get("/crm/v3/objects/:resource/:resource_id", async (req, res) => {
  if (!data[req.params.resource as DataKey].set.has(parseInt(req.params.resource_id))) {
    res.type("html")
    res.status(404)
    res.send()
  } else {
    res.type("json")
    res.status(200)
    res.send(data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id)))
    }
})

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

app.get("/crm/v3/objects/:resource/:resource_id/associations/:to_object_type", async (req, res) => {
  const related: number[] =
    data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id))[
      req.params.to_object_type
    ] ?? []
  const results = related.map((elem) => {
    return data[pluralize(req.params.to_object_type) as DataKey].set.get(elem)
  })
  res.type("json")
  res.status(200)
  res.send({
    results,
  })
})

app.put(
  "/crm/v3/objects/:resource/:resource_id/associations/:to_object_type/:object_id/:association_type",
  async (req, res) => {
    if (
      data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id))[
        req.params.to_object_type
      ] !== undefined
    ) {
      data[req.params.resource as DataKey].set.get(parseInt(req.params.resource_id))[
        req.params.to_object_type
      ] = []
    }
    data[req.params.resource as DataKey].set
      .get(parseInt(req.params.resource_id))
      [req.params.to_object_type].push(parseInt(req.params.object_id))
    res.status(200)
    res.send("done")
  }
)

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
