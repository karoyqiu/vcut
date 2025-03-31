import { zodResolver } from '@hookform/resolvers/zod';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Clapperboard, FolderOpen, Timer } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import '@/App.css';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const pad = (value: number, maxLength = 2) => value.toString().padStart(maxLength, '0');

const secondsToTime = (seconds: number) => {
  const ms = Math.round((seconds % 1) * 1000);
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 60 / 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
};

const timeString = z.string().regex(/\d{2}:\d{2}:\d{2}.\d{3}/);
const spanSchema = z
  .object({
    start: timeString,
    end: timeString,
  })
  .refine(
    (values) => {
      const s = parseFloat(values.start.replaceAll(':', ''));
      const e = parseFloat(values.end.replaceAll(':', ''));
      return e > s;
    },
    { message: 'End time must be greater than start time.' },
  );

function App() {
  const [duration, setDuration] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const form = useForm<z.infer<typeof spanSchema>>({
    resolver: zodResolver(spanSchema),
    defaultValues: {
      start: '00:00:00.000',
      end: '00:00:00.000',
    },
  });
  const values = form.watch();

  return (
    <main className="flex flex-col gap-4">
      <video
        ref={video}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onDurationChange={(e) => {
          setDuration(e.currentTarget.duration);
          form.reset({ start: '00:00:00.000', end: secondsToTime(e.currentTarget.duration) });
        }}
      />
      <div className="flex flex-col gap-4 p-4">
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(async () => {})}>
            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <div className="flex">
                      <FormControl>
                        <Input
                          {...field}
                          className="rounded-e-none border-e-0 font-mono"
                          type="time"
                          step={0.001}
                          min={'00:00:00.000'}
                          max={values.end}
                          disabled={!video.current?.src}
                        />
                      </FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-s-none"
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={!video.current?.src}
                            onClick={() =>
                              form.setValue('start', secondsToTime(video.current?.currentTime ?? 0))
                            }
                          >
                            <Timer />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Set as current time</TooltipContent>
                      </Tooltip>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End time</FormLabel>
                    <div className="flex">
                      <FormControl>
                        <Input
                          {...field}
                          className="rounded-e-none border-e-0 font-mono"
                          type="time"
                          step={0.001}
                          min={values.start}
                          max={secondsToTime(duration)}
                          disabled={!video.current?.src}
                        />
                      </FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-s-none"
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={!video.current?.src}
                            onClick={() =>
                              form.setValue('end', secondsToTime(video.current?.currentTime ?? 0))
                            }
                          >
                            <Timer />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Set as current time</TooltipContent>
                      </Tooltip>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={async () => {
                  const file = await open({
                    filters: [
                      {
                        extensions: ['webm', 'mp4', 'wmv', 'mpg', 'mov', 'mpeg', 'm4v', 'avi'],
                        name: 'Video files',
                      },
                    ],
                  });

                  if (file && video.current) {
                    video.current.src = convertFileSrc(file);
                  }
                }}
              >
                <FolderOpen />
                Select video file
              </Button>
              <Button
                type="submit"
                disabled={!form.formState.isValid && form.formState.isSubmitting}
              >
                <Clapperboard />
                Cut
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </main>
  );
}

export default App;
