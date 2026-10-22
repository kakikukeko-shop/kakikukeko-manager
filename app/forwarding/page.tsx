import { redirect } from 'next/navigation'

export default function ForwardingPage() {
  redirect('/products?tab=inventory')
}