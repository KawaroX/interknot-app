/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("posts")

  // add hot_score field
  collection.fields.add(new Field({
    "name": "hot_score",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("posts")

  // remove hot_score field
  const field = collection.fields.findByName("hot_score")
  if (field) {
    collection.fields.remove(field)
    return app.save(collection)
  }
})
