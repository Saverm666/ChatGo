export function formatTaskListCheckboxMarker(input: {
  checked: boolean
  followingStartsWithSpace: boolean
}): string {
  const marker = input.checked ? '[x]' : '[ ]'
  return input.followingStartsWithSpace ? marker : `${marker} `
}
