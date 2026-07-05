import { NextResponse } from 'next/server'

export function json(data: any, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export const unauthorized = () => err('No autorizado', 401)
export const forbidden = () => err('Sin permiso', 403)
export const notFound = () => err('No encontrado', 404)
