/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // allow auth; email verification enforcement is handled in pb_hooks
  unmarshal({
    "authRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // revert to default (no auth rule)
  unmarshal({
    "authRule": ""
  }, collection)

  return app.save(collection)
})
