/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1125843985")

  // update field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "select2358339750",
    "maxSelect": 1,
    "name": "moderation_status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "pending_ai",
      "pending_review",
      "active",
      "hidden",
      "rejected"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1125843985")

  // update field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "select2358339750",
    "maxSelect": 1,
    "name": "moderation_status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "pending_ai",
      "pending_review",
      "active",
      "hidden",
      "rejected; default pending_ai"
    ]
  }))

  return app.save(collection)
})
