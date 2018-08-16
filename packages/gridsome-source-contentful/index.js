const contentful = require('contentful')
const resolveType = require('./lib/resolve-type')

const { Source } = require('@gridsome/core')

class ContentfulSource extends Source {
  static defaultOptions () {
    return {
      space: undefined,
      environment: 'master',
      host: 'cdn.contentful.com',
      typeNamePrefix: 'Contentful'
    }
  }

  async apply () {
    const { space, accessToken, environment, host } = this.options

    const client = contentful.createClient({
      space, accessToken, environment, host
    })

    const cache = { contentTypes: {}}
    const { items: contentTypes } = await client.getContentTypes()

    // api.service.info(`Content types (${contentTypes.length})`, namespace)

    for (const contentType of contentTypes) {
      // filter out fields which are not references
      const fields = contentType.fields.filter(({ type, items }) => {
        if (items) return items.type !== 'Link'
        return type !== 'Link'
      })

      // get all reference fields
      // TODO: include Asset references
      const refs = contentType.fields.filter(({ items }) => {
        return items && items.type === 'Link' && items.linkType === 'Entry'
      })

      // cache results to let entries access them...
      cache.contentTypes[contentType.sys.id] = {
        contentType,
        fields,
        refs
      }

      this.addType(contentType.name, {
        name: contentType.name,
        fields: () => fields.reduce((fields, field) => {
          fields[field.id] = {
            description: field.name,
            type: resolveType(field, this.graphql)
          }

          return fields
        }, {}),
        refs: ({ addReference, nodeTypes }) => refs.forEach(field => addReference({
          name: field.id,
          description: field.name,
          types: field.items.validations.reduce((types, { linkContentType }) => {
            linkContentType.forEach(id => {
              const { type } = this.getType(cache.contentTypes[id].contentType.name)
              types.push(nodeTypes[type])
            })
            return types
          }, [])
        }))
      })
    }

    const { items: entries } = await client.getEntries()

    // api.service.info(`Entries (${entries.length})`, namespace)

    for (const item of entries) {
      const id = item.sys.contentType.sys.id
      const { contentType, fields, refs } = cache.contentTypes[id]

      // TODO: let user choose which field contains the slug

      this.addNode(contentType.name, {
        _id: this.makeUid(item.sys.id),
        title: item.fields[contentType.displayField],
        slug: item.fields.slug || '',
        created: new Date(item.sys.createdAt),
        updated: new Date(item.sys.updatedAt),

        fields: fields.reduce((fields, { id }) => {
          if (!item.fields[id]) return fields
          fields[id] = item.fields[id]
          return fields
        }, {}),

        refs: refs.reduce((refs, { id }) => {
          if (!item.fields[id]) return refs

          refs[id] = item.fields[id].map(item => {
            return this.makeUid(item.sys.id)
          })

          return refs
        }, {})
      })
    }
  }
}

module.exports = ContentfulSource