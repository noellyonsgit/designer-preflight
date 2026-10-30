import _ from 'underscore'

export function titleCase(text) {
  return _.map(text.split(' '), (w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}
