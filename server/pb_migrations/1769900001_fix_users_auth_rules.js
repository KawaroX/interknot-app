/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // Allow anyone to create (register) and authenticate
  unmarshal({
    "createRule": null,
    "authRule": null
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // Revert to restricted rules
  unmarshal({
    "createRule": "",
    "authRule": ""
  }, collection)

  return app.save(collection)
})
