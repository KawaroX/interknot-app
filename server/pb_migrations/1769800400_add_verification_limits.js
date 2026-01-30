/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // add field
  collection.fields.addAt(30, new Field({
    "hidden": false,
    "id": "number3019641739",
    "max": null,
    "min": null,
    "name": "verification_resend_count",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(31, new Field({
    "hidden": false,
    "id": "text3039631184",
    "max": 0,
    "min": 0,
    "name": "verification_resend_day",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(32, new Field({
    "hidden": false,
    "id": "date2989134229",
    "max": "",
    "min": "",
    "name": "verification_resend_last_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // remove field
  collection.fields.removeById("number3019641739")

  // remove field
  collection.fields.removeById("text3039631184")

  // remove field
  collection.fields.removeById("date2989134229")

  return app.save(collection)
})
