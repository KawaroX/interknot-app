/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // Allow anyone to create (register) auth records
  unmarshal({
    "createRule": null
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // Revert to empty createRule
  unmarshal({
    "createRule": ""
  }, collection)

  return app.save(collection)
})
