export type Structure = 'primary' | 'secondary'

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const SECONDARY_PERIODS = [
  { time: '9:20-10:00', type: 'period' },
  { time: '10:00-10:40', type: 'period' },
  { time: '10:40-10:50', type: 'break' },
  { time: '10:50-11:30', type: 'period' },
  { time: '11:30-12:10', type: 'period' },
  { time: '12:10-12:50', type: 'period' },
  { time: '12:50-1:20', type: 'lunch' },
  { time: '1:20-2:00', type: 'period' },
  { time: '2:00-2:40', type: 'period' },
  { time: '2:40-2:50', type: 'break' },
  { time: '2:50-3:30', type: 'period' },
  { time: '4:00-5:10', type: 'period' },
]

export const PRIMARY_PERIODS = [
  { time: '9:20-10:00', type: 'period' },
  { time: '10:00-10:40', type: 'period' },
  { time: '10:40-10:50', type: 'break' },
  { time: '10:50-11:30', type: 'period' },
  { time: '11:30-12:10', type: 'period' },
  { time: '12:10-12:40', type: 'lunch' },
  { time: '12:40-1:20', type: 'period' },
  { time: '1:20-2:00', type: 'period' },
  { time: '2:00-2:10', type: 'break' },
  { time: '2:10-2:50', type: 'period' },
  { time: '2:50-3:30', type: 'period' },
  { time: '4:00-5:10', type: 'period' },
]

export const PERIODS_BY_STRUCTURE: Record<Structure, typeof SECONDARY_PERIODS> = {
  primary: PRIMARY_PERIODS,
  secondary: SECONDARY_PERIODS,
}

export const PERIODS = SECONDARY_PERIODS
