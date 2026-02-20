import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'siteops',
  eventKey: process.env.INNGEST_EVENT_KEY,
})
