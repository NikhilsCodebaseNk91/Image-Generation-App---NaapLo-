export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export const encodedOutputType = (value: string) => encodeURIComponent(value);
