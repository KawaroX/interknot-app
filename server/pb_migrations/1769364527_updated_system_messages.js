/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3701752454")

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "select625724656",
    "maxSelect": 1,
    "name": "message_type",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "system",
      "like",
      "comment"
    ]
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "cascadeDelete": false,
    "collectionId": "_pb_users_auth_",
    "hidden": false,
    "id": "relation1148540665",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "actor",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3701752454")

  // remove field
  collection.fields.removeById("select625724656")

  // remove field
  collection.fields.removeById("relation1148540665")

  return app.save(collection)
})
