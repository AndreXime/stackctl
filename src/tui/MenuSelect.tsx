import { Box, Text, useInput } from 'ink'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

export interface MenuOption {
   value: string
   label: string
   render?: (state: { isFocused: boolean; isSelected: boolean }) => ReactNode
}

interface MenuSelectProps {
   options: MenuOption[]
   visibleOptionCount?: number
   isActive?: boolean
   onLeaveDown?: () => void
   onLeaveUp?: () => void
   onChange: (value: string) => void
}

function optionLabelColor(isFocused: boolean, isSelected: boolean) {
   if (isFocused) return 'blue'
   if (isSelected) return 'green'
   return undefined
}

export function MenuSelect({
   options,
   visibleOptionCount = 5,
   isActive = true,
   onLeaveDown,
   onLeaveUp,
   onChange,
}: MenuSelectProps) {
   const visibleCount = Math.min(visibleOptionCount, options.length)
   const [focusedIndex, setFocusedIndex] = useState(0)
   const [selectedValue, setSelectedValue] = useState<string>()
   const [scrollOffset, setScrollOffset] = useState(0)
   const focusedIndexRef = useRef(focusedIndex)
   const scrollOffsetRef = useRef(scrollOffset)
   focusedIndexRef.current = focusedIndex
   scrollOffsetRef.current = scrollOffset

   const visibleOptions = useMemo(
      () => options.slice(scrollOffset, scrollOffset + visibleCount),
      [options, scrollOffset, visibleCount],
   )

   useEffect(() => {
      if (focusedIndex >= options.length) {
         setFocusedIndex(Math.max(0, options.length - 1))
      }
   }, [focusedIndex, options.length])

   useEffect(() => {
      if (isActive) return
      setFocusedIndex(0)
      setScrollOffset(0)
   }, [isActive])

   useInput(
      (_input, key) => {
         if (key.downArrow) {
            const index = focusedIndexRef.current
            if (index >= options.length - 1) {
               queueMicrotask(() => onLeaveDown?.())
               return
            }
            const next = index + 1
            const offset = scrollOffsetRef.current
            if (next >= offset + visibleCount) {
               setScrollOffset(next - visibleCount + 1)
            }
            setFocusedIndex(next)
         }

         if (key.upArrow) {
            const index = focusedIndexRef.current
            if (index <= 0) {
               queueMicrotask(() => onLeaveUp?.())
               return
            }
            const next = index - 1
            if (next < scrollOffsetRef.current) {
               setScrollOffset(next)
            }
            setFocusedIndex(next)
         }

         if (key.return) {
            const value = options[focusedIndexRef.current]?.value
            if (value) {
               setSelectedValue(value)
            }
         }
      },
      { isActive },
   )

   useEffect(() => {
      if (!selectedValue) return
      onChange(selectedValue)
      setSelectedValue(undefined)
   }, [selectedValue, onChange])

   return (
      <Box flexDirection="column">
         {visibleOptions.map((option, visibleIndex) => {
            const index = scrollOffset + visibleIndex
            const isFocused = isActive && focusedIndex === index
            const isSelected = selectedValue === option.value
            const labelColor = optionLabelColor(isFocused, isSelected)

            return (
               <Box key={option.value} gap={1} paddingLeft={isFocused ? 0 : 2}>
                  {isFocused && <Text color="blue">{'›'}</Text>}
                  {option.render ? (
                     option.render({ isFocused, isSelected })
                  ) : labelColor ? (
                     <Text color={labelColor}>{option.label}</Text>
                  ) : (
                     <Text>{option.label}</Text>
                  )}
                  {isSelected && <Text color="green">✓</Text>}
               </Box>
            )
         })}
      </Box>
   )
}
