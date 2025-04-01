import { zodResolver } from '@hookform/resolvers/zod';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { type Child, Command } from '@tauri-apps/plugin-shell';
import { CircleX, Clapperboard, FolderOpen, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTernaryDarkMode } from 'usehooks-ts';
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
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const pad = (value: number, maxLength = 2) => value.toString().padStart(maxLength, '0');

const nts = (seconds: number) => {
  const ms = Math.round((seconds % 1) * 1000);
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 60 / 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
};

const stn = (s: string) => {
  const splitted = s.split(':');
  return splitted.reduce(
    (prev, current, index, array) => prev + parseFloat(current) * 60 ** (array.length - index - 1),
    0,
  );
};

const timeString = z.string().regex(/\d{2}:\d{2}:\d{2}.\d{3}/);
const spanSchema = z
  .object({
    start: timeString,
    end: timeString,
  })
  .refine(
    (values) => {
      const s = stn(values.start);
      const e = stn(values.end);
      return e > s;
    },
    { message: 'End time must be greater than start time.' },
  );

const percent = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const calcEta = (startedAt: number, progress: number) => {
  if (progress === 0) {
    return '--';
  }

  const eta = ((1 - progress) * (Date.now() - startedAt)) / progress / 1000;
  return nts(eta);
};

function App() {
  const [inputFilename, setInputFilename] = useState('');
  const [inputDuration, setInputDuration] = useState(0);
  const [outputDuration, setOutputDuration] = useState(100);
  const [progress, setProgress] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [ffmpeg, setFfmpeg] = useState<Child>();
  const video = useRef<HTMLVideoElement>(null);
  const { ternaryDarkMode } = useTernaryDarkMode({ localStorageKey: 'dark-mode' });
  const form = useForm<z.infer<typeof spanSchema>>({
    resolver: zodResolver(spanSchema),
    defaultValues: {
      start: '00:00:00.000',
      end: '00:00:00.000',
    },
  });
  const values = form.watch();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (ternaryDarkMode === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
    } else {
      root.classList.add(ternaryDarkMode);
    }
  }, [ternaryDarkMode]);

  return (
    <main className="flex flex-col gap-4">
      <video
        ref={video}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onDurationChange={(e) => {
          setInputDuration(e.currentTarget.duration);
          form.reset({ start: '00:00:00.000', end: nts(e.currentTarget.duration) });
        }}
      />
      <div className="flex flex-col gap-4 p-4">
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              const outputFilename = await save({
                defaultPath: inputFilename,
                filters: [
                  {
                    extensions: ['webm', 'mp4', 'wmv', 'mpg', 'mov', 'mpeg', 'm4v', 'avi'],
                    name: 'Video files',
                  },
                ],
              });

              if (outputFilename) {
                const od = stn(values.end) - stn(values.start);
                setProgress(0);
                setOutputDuration(od);

                const command = Command.sidecar('binaries/ffmpeg', [
                  '-y',
                  '-progress',
                  'pipe:1',
                  '-nostats',
                  '-loglevel',
                  'error',
                  '-i',
                  inputFilename,
                  '-ss',
                  values.start,
                  '-to',
                  values.end,
                  '-c',
                  'copy',
                  outputFilename,
                ]);
                command.stdout.on('data', (line) => {
                  const key = 'out_time_us=';

                  if (line.startsWith(key)) {
                    const value = line.substring(key.length);
                    const us = parseFloat(value) || 0;
                    setProgress(us / 1000000);
                  }
                });
                command.on('close', () => {
                  console.timeEnd('ffmpeg');
                  setProgress(od);
                  setFfmpeg(undefined);
                });

                const child = await command.spawn();
                console.time('ffmpeg');
                setStartedAt(Date.now());
                setFfmpeg(child);
              }
            })}
          >
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
                          disabled={!video.current?.src || !!ffmpeg}
                        />
                      </FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-s-none"
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={!video.current?.src || !!ffmpeg}
                            onClick={() =>
                              form.setValue('start', nts(video.current?.currentTime ?? 0))
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
                          max={nts(inputDuration)}
                          disabled={!video.current?.src || !!ffmpeg}
                        />
                      </FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-s-none"
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={!video.current?.src || !!ffmpeg}
                            onClick={() =>
                              form.setValue('end', nts(video.current?.currentTime ?? 0))
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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={!!ffmpeg}
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
                    setInputFilename(file);
                    video.current.src = convertFileSrc(file);
                  }
                }}
              >
                <FolderOpen />
                Select video file
              </Button>
              {ffmpeg ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (ffmpeg) {
                      ffmpeg.kill();
                    }
                  }}
                >
                  <CircleX />
                  Abort
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!form.formState.isValid && form.formState.isSubmitting}
                >
                  <Clapperboard />
                  Cut
                </Button>
              )}
              <div className="flex grow flex-col gap-0.5">
                <p className="font-mono text-xs text-muted-foreground">{`Progress: ${percent.format(progress / outputDuration)}, ETA ${calcEta(startedAt, progress / outputDuration)}`}</p>
                <Progress max={outputDuration} value={progress} />
              </div>
            </div>
          </form>
        </Form>
      </div>
    </main>
  );
}

export default App;
