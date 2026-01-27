/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_540385355")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_THj3i8RxDv` ON `legal_documents` (`key`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_540385355")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
