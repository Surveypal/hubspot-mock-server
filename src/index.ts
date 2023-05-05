import app from "./app"

const port = process.env.PORT ?? 8000

// eslint-disable-next-line @typescript-eslint/no-var-requires
const morgan = require("morgan")
app.use(morgan("combined"))

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`)
})
