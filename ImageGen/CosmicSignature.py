import cv2
import sys
from PIL import Image, ImageDraw

import numpy as np
import random

#random.seed()

def ran():
    return random.random() * 20 - 10

def ran_mass():
    return 10 + random.random()

# masses of planets
m_1 = ran_mass()
m_2 = ran_mass()
m_3 = ran_mass()

# starting coordinates for planets
# p1_start = x_1, y_1, z_1
p1_start = np.array([-10, 10 + ran(), -11])
v1_start = np.array([-3, 0, 0])

# p2_start = x_2, y_2, z_2
p2_start = np.array([0, 0, 0])
v2_start = np.array([0, 0, 0])

# p3_start = x_3, y_3, z_3
p3_start = np.array([10, 10, 10])
v3_start = np.array([3, 0, 0])

def accelerations(p1, p2, p3, m_1, m_2, m_3):
    """
    A function to calculate the derivatives of x, y, and z
    given 3 object and their locations according to Newton's laws
    """

    #m_1, m_2, m_3 = self.m1, self.m2, self.m3
    planet_1_dv = -9.8 * m_2 * (p1 - p2)/(np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2 + (p1[2] - p2[2])**2)**3) - \
            9.8 * m_3 * (p1 - p3)/(np.sqrt((p1[0] - p3[0])**2 + (p1[1] - p3[1])**2 + (p1[2] - p3[2])**2)**3)

    planet_2_dv = -9.8 * m_3 * (p2 - p3)/(np.sqrt((p2[0] - p3[0])**2 + (p2[1] - p3[1])**2 + (p2[2] - p3[2])**2)**3) - \
            9.8 * m_1 * (p2 - p1)/(np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2 + (p2[2] - p1[2])**2)**3)

    planet_3_dv = -9.8 * m_1 * (p3 - p1)/(np.sqrt((p3[0] - p1[0])**2 + (p3[1] - p1[1])**2 + (p3[2] - p1[2])**2)**3) - \
            9.8 * m_2 * (p3 - p2)/(np.sqrt((p3[0] - p2[0])**2 + (p3[1] - p2[1])**2 + (p3[2] - p2[2])**2)**3)

    return planet_1_dv, planet_2_dv, planet_3_dv

# parameters
delta_t = 0.001
steps = 200000

# initialize trajectory array
p1 = np.array([[0.,0.,0.] for i in range(steps)])
v1 = np.array([[0.,0.,0.] for i in range(steps)])

p2 = np.array([[0.,0.,0.] for j in range(steps)])
v2 = np.array([[0.,0.,0.] for j in range(steps)])

p3 = np.array([[0.,0.,0.] for k in range(steps)])
v3 = np.array([[0.,0.,0.] for k in range(steps)])

# starting point and velocity
p1[0], p2[0], p3[0] = p1_start, p2_start, p3_start

v1[0], v2[0], v3[0] = v1_start, v2_start, v3_start

# evolution of the system

accels = []
for i in range(steps-1):
    # calculate derivatives
    dv1, dv2, dv3 = accelerations(p1[i], p2[i], p3[i], m_1, m_2, m_3)

    v1[i + 1] = v1[i] + dv1 * delta_t
    v2[i + 1] = v2[i] + dv2 * delta_t
    v3[i + 1] = v3[i] + dv3 * delta_t

    p1[i + 1] = p1[i] + v1[i] * delta_t
    p2[i + 1] = p2[i] + v2[i] * delta_t
    p3[i + 1] = p3[i] + v3[i] * delta_t

def colors(n_steps):

    def random_color_1ch(num_steps):
        '''Geenrate colors for 1 channel.'''
        cur = 0
        result = []
        for _ in range(num_steps):
            cur += 1 if random.randint(0, 1) == 1 else -1
            result.append(cur)
        lowest = min(result)
        highest = max(result)
        for i in range(len(result)):
            result[i] = int(255 * (result[i] - lowest) / (highest - lowest))
        return result

    c1 = random_color_1ch(n_steps)
    c2 = random_color_1ch(n_steps)
    c3 = random_color_1ch(n_steps)

    C = list(zip(c1, c2, c3))
    return C


C = colors(len(p1))

xs = []
for p in p1:
    xs.append(p[0])

ys = []
for p in p1:
    ys.append(p[1])

class Painter:

    def __init__(self, xs, ys, C, width, height):
        self.xs = xs
        self.ys = ys
        x_min = min(xs)
        y_min = min(ys)
        x_max = max(xs)
        y_max = max(ys)

        x_range = x_max - x_min
        y_range = y_max - y_min

        self.full_range = max(x_range, y_range)
        self.x_middle = (x_max + x_min) / 2
        self.y_middle = (y_max + y_min) / 2

        self.width = width
        self.height = height
        self.border = 10
        self.xscreen_middle = self.width / 2
        self.yscreen_middle = self.height / 2

        self.C = C

        self.i = 1



    def add_to_frame(self, im):

        draw = ImageDraw.Draw(im)
        if self.i > len(self.xs):
            return None

        while self.i < len(self.xs):
            x1_relative_to_middle = (self.xs[self.i - 1] - self.x_middle) / self.full_range # between -0.5 and 0.5
            x1 = 0.9 * x1_relative_to_middle * self.width + self.width / 2

            y1_relative_to_middle = (self.ys[self.i - 1] - self.y_middle) / self.full_range # between -0.5 and 0.5
            y1 = 0.9 * y1_relative_to_middle * self.height + self.height / 2

            x2_relative_to_middle = (self.xs[self.i] - self.x_middle) / self.full_range # between -0.5 and 0.5
            x2 = 0.9 * x2_relative_to_middle * self.width + self.width / 2

            y2_relative_to_middle = (self.ys[self.i] - self.y_middle) / self.full_range # between -0.5 and 0.5
            y2 = 0.9 * y2_relative_to_middle * self.height + self.height / 2

            self.i += 1

            draw.line([x1, y1, x2, y2], fill=C[self.i-1], width=5)

            if self.i % 1000 == 0:
                return im


width = 1000
height = 1000
images = []
im = Image.new('RGB', (width, height))
images.append(im)

p = Painter(xs, ys, C, width, height)

while True:
    im = im.copy()
    im = p.add_to_frame(im)
    if im is None:
        break
    images.append(im)
    im = im.copy()

VIDEO_FPS=60

out = cv2.VideoWriter(f'vid.mp4',cv2.VideoWriter_fourcc(*'MP4V'), VIDEO_FPS, (1000, 1000))

for i in range(len(images)):
    cv_img = cv2.cvtColor(np.array(images[i]), cv2.COLOR_RGB2BGR)
    out.write(cv_img)

out.release()
print("Video saved")

